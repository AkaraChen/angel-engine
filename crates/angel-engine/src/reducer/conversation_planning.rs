use std::collections::BTreeMap;

use crate::command::{DiscoverConversationsParams, ResumeTarget, StartConversationParams};
use crate::error::EngineError;
use crate::ids::{ConversationId, RemoteConversationId, TurnId};
use crate::protocol::{CodexMethod, ProtocolEffect, ProtocolFlavor, ProtocolMethod};
use crate::state::{
    ContextPatch, ConversationLifecycle, ConversationState, HydrationSource, ProvisionOp,
    RuntimeState,
};

use super::context_effects::codex_context_fields;
use super::{AngelEngine, CommandPlan, PendingRequest};

impl AngelEngine {
    pub(super) fn plan_initialize(&mut self) -> Result<CommandPlan, EngineError> {
        let request_id = self.next_request_id();
        self.runtime = RuntimeState::Negotiating;
        self.pending
            .insert(request_id.clone(), PendingRequest::Initialize)?;
        Ok(CommandPlan {
            effects: vec![
                ProtocolEffect::new(self.protocol, self.method_initialize())
                    .request_id(request_id.clone()),
            ],
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    pub(super) fn plan_authenticate(
        &mut self,
        method: crate::AuthMethodId,
    ) -> Result<CommandPlan, EngineError> {
        if !matches!(self.runtime, RuntimeState::AwaitingAuth { .. }) {
            return Err(EngineError::InvalidState {
                expected: "AwaitingAuth".to_string(),
                actual: format!("{:?}", self.runtime),
            });
        }
        let request_id = self.next_request_id();
        self.pending
            .insert(request_id.clone(), PendingRequest::Authenticate)?;
        Ok(CommandPlan {
            effects: vec![
                ProtocolEffect::new(self.protocol, self.method_authenticate())
                    .request_id(request_id.clone())
                    .field("methodId", method.to_string()),
            ],
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    pub(super) fn plan_discover_conversations(
        &mut self,
        params: DiscoverConversationsParams,
    ) -> Result<CommandPlan, EngineError> {
        self.ensure_runtime_available()?;
        self.default_capabilities
            .lifecycle
            .list
            .require("conversation.list")?;
        if !params.additional_directories.is_empty() {
            self.default_capabilities
                .context
                .additional_directories
                .require("context.additional_directories")?;
        }
        let request_id = self.next_request_id();
        self.pending.insert(
            request_id.clone(),
            PendingRequest::DiscoverConversations {
                params: params.clone(),
            },
        )?;
        let mut effect = ProtocolEffect::new(self.protocol, self.method_list_conversations())
            .request_id(request_id.clone());
        if let Some(cwd) = params.cwd {
            effect = effect.field("cwd", cwd);
        }
        if !params.additional_directories.is_empty() {
            for (index, directory) in params.additional_directories.iter().enumerate() {
                effect = effect.field(format!("additionalDirectory.{index}"), directory.clone());
            }
            effect = effect.field(
                "additionalDirectoryCount",
                params.additional_directories.len().to_string(),
            );
        }
        if let Some(cursor) = params.cursor {
            effect = effect.field("cursor", cursor);
        }
        Ok(CommandPlan {
            effects: vec![effect],
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    pub(super) fn plan_start_conversation(
        &mut self,
        params: StartConversationParams,
    ) -> Result<CommandPlan, EngineError> {
        self.ensure_runtime_available()?;
        self.default_capabilities
            .lifecycle
            .create
            .require("conversation.create")?;
        if !params.additional_directories.is_empty() {
            self.default_capabilities
                .context
                .additional_directories
                .require("context.additional_directories")?;
        }
        let conversation_id = self.next_conversation_id();
        let request_id = self.next_request_id();
        let remote = RemoteConversationId::Pending(conversation_id.to_string());
        let mut conversation = ConversationState::new(
            conversation_id.clone(),
            remote,
            ConversationLifecycle::Provisioning {
                op: ProvisionOp::New,
            },
            self.default_capabilities.clone(),
        );
        conversation.context.apply_patch(params.context.clone());
        if !params.additional_directories.is_empty() {
            conversation.context.apply_patch(ContextPatch::one(
                crate::ContextUpdate::AdditionalDirectories {
                    scope: crate::ContextScope::Conversation,
                    directories: params.additional_directories.clone(),
                },
            ));
        }
        let codex_context_fields = if self.protocol == ProtocolFlavor::CodexAppServer {
            codex_context_fields(&conversation.context)
        } else {
            Vec::new()
        };
        self.conversations
            .insert(conversation_id.clone(), conversation);
        self.selected = Some(conversation_id.clone());
        self.pending.insert(
            request_id.clone(),
            PendingRequest::StartConversation {
                conversation_id: conversation_id.clone(),
            },
        )?;

        let mut effect = ProtocolEffect::new(self.protocol, self.method_start_conversation())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        if let Some(cwd) = params.cwd {
            effect = effect.field("cwd", cwd);
        }
        if !params.additional_directories.is_empty() {
            for (index, directory) in params.additional_directories.iter().enumerate() {
                effect = effect.field(format!("additionalDirectory.{index}"), directory.clone());
            }
            effect = effect.field(
                "additionalDirectoryCount",
                params.additional_directories.len().to_string(),
            );
        }
        for (key, value) in codex_context_fields {
            effect = effect.field(key, value);
        }
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    pub(super) fn plan_resume_conversation(
        &mut self,
        target: ResumeTarget,
    ) -> Result<CommandPlan, EngineError> {
        self.ensure_runtime_available()?;
        let (conversation_id, remote, hydrate, mut fields, reuse_existing, additional_directories) =
            match target {
                ResumeTarget::Conversation(conversation_id) => {
                    let conversation = self.conversation(&conversation_id)?;
                    let remote = conversation.remote.clone();
                    let remote_id =
                        remote
                            .as_protocol_id()
                            .ok_or_else(|| EngineError::InvalidState {
                                expected: "remote conversation id".to_string(),
                                actual: format!("{:?}", remote),
                            })?;
                    let mut fields = BTreeMap::new();
                    fields.insert("remoteConversationId".to_string(), remote_id.to_string());
                    let additional_directories = conversation
                        .context
                        .additional_directories
                        .effective()
                        .map(|directories| {
                            directories
                                .iter()
                                .map(|directory| directory.display().to_string())
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    (
                        conversation_id,
                        remote,
                        matches!(conversation.lifecycle, ConversationLifecycle::Discovered),
                        fields,
                        true,
                        additional_directories,
                    )
                }
                ResumeTarget::Remote { id, hydrate } => {
                    let conversation_id = self.next_conversation_id();
                    let mut fields = BTreeMap::new();
                    fields.insert("remoteConversationId".to_string(), id.clone());
                    let remote = match self.protocol {
                        ProtocolFlavor::Acp => RemoteConversationId::Known(id),
                        ProtocolFlavor::CodexAppServer => RemoteConversationId::Known(id),
                    };
                    (conversation_id, remote, hydrate, fields, false, Vec::new())
                }
                ResumeTarget::RemoteWithContext {
                    id,
                    hydrate,
                    additional_directories,
                } => {
                    let conversation_id = self.next_conversation_id();
                    let mut fields = BTreeMap::new();
                    fields.insert("remoteConversationId".to_string(), id.clone());
                    let remote = match self.protocol {
                        ProtocolFlavor::Acp => RemoteConversationId::Known(id),
                        ProtocolFlavor::CodexAppServer => RemoteConversationId::Known(id),
                    };
                    (
                        conversation_id,
                        remote,
                        hydrate,
                        fields,
                        false,
                        additional_directories,
                    )
                }
            };

        let capabilities = if reuse_existing {
            &self.conversation(&conversation_id)?.capabilities
        } else {
            &self.default_capabilities
        };
        if hydrate {
            capabilities.lifecycle.load.require("conversation.load")?;
        } else {
            capabilities
                .lifecycle
                .resume
                .require("conversation.resume")?;
        }
        if !additional_directories.is_empty() {
            capabilities
                .context
                .additional_directories
                .require("context.additional_directories")?;
        }

        let request_id = self.next_request_id();
        let op = if hydrate {
            ProvisionOp::Load
        } else {
            ProvisionOp::Resume
        };
        let lifecycle = if hydrate {
            ConversationLifecycle::Hydrating {
                source: match self.protocol {
                    ProtocolFlavor::Acp => HydrationSource::AcpLoad,
                    ProtocolFlavor::CodexAppServer => HydrationSource::CodexResume,
                },
            }
        } else {
            ConversationLifecycle::Provisioning { op }
        };
        if reuse_existing {
            let conversation = self.conversation_mut(&conversation_id)?;
            conversation.remote = remote;
            conversation.lifecycle = lifecycle;
            if !additional_directories.is_empty() {
                conversation.context.apply_patch(ContextPatch::one(
                    crate::ContextUpdate::AdditionalDirectories {
                        scope: crate::ContextScope::Conversation,
                        directories: additional_directories.clone(),
                    },
                ));
            }
        } else {
            let mut state = ConversationState::new(
                conversation_id.clone(),
                remote,
                lifecycle,
                self.default_capabilities.clone(),
            );
            if !additional_directories.is_empty() {
                state.context.apply_patch(ContextPatch::one(
                    crate::ContextUpdate::AdditionalDirectories {
                        scope: crate::ContextScope::Conversation,
                        directories: additional_directories.clone(),
                    },
                ));
            }
            self.conversations.insert(conversation_id.clone(), state);
        }
        self.selected = Some(conversation_id.clone());
        self.pending.insert(
            request_id.clone(),
            PendingRequest::ResumeConversation {
                conversation_id: conversation_id.clone(),
                hydrate,
            },
        )?;

        let method = self.method_resume_conversation(hydrate);
        let mut effect = ProtocolEffect::new(self.protocol, method)
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        fields.insert("hydrate".to_string(), hydrate.to_string());
        if !additional_directories.is_empty() {
            for (index, directory) in additional_directories.iter().enumerate() {
                fields.insert(format!("additionalDirectory.{index}"), directory.clone());
            }
            fields.insert(
                "additionalDirectoryCount".to_string(),
                additional_directories.len().to_string(),
            );
        }
        for (key, value) in fields {
            effect = effect.field(key, value);
        }
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    pub(super) fn plan_fork_conversation(
        &mut self,
        source: ConversationId,
        at: Option<TurnId>,
    ) -> Result<CommandPlan, EngineError> {
        self.ensure_runtime_available()?;
        self.default_capabilities
            .lifecycle
            .fork
            .require("conversation.fork")?;
        self.conversation(&source)?;
        let conversation_id = self.next_conversation_id();
        let request_id = self.next_request_id();
        let state = ConversationState::new(
            conversation_id.clone(),
            RemoteConversationId::Pending(conversation_id.to_string()),
            ConversationLifecycle::Provisioning {
                op: ProvisionOp::Fork,
            },
            self.default_capabilities.clone(),
        );
        self.conversations.insert(conversation_id.clone(), state);
        self.pending.insert(
            request_id.clone(),
            PendingRequest::ForkConversation {
                conversation_id: conversation_id.clone(),
            },
        )?;
        let mut effect = ProtocolEffect::new(self.protocol, self.method_fork_conversation())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .field("sourceConversationId", source.to_string());
        if let Some(turn_id) = at {
            effect = effect.field("atTurnId", turn_id.to_string());
        }
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    pub(super) fn plan_archive_conversation(
        &mut self,
        conversation_id: ConversationId,
        archive: bool,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            conversation
                .capabilities
                .lifecycle
                .archive
                .require("conversation.archive")?;
        }
        let request_id = self.next_request_id();
        let method = match (self.protocol, archive) {
            (ProtocolFlavor::CodexAppServer, true) => {
                ProtocolMethod::Codex(CodexMethod::ThreadArchive)
            }
            (ProtocolFlavor::CodexAppServer, false) => {
                ProtocolMethod::Codex(CodexMethod::ThreadUnarchive)
            }
            (_, _) => ProtocolMethod::Extension(if archive {
                "conversation/archive".to_string()
            } else {
                "conversation/unarchive".to_string()
            }),
        };
        let effect = ProtocolEffect::new(self.protocol, method)
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    pub(super) fn plan_close_conversation(
        &mut self,
        conversation_id: ConversationId,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            conversation
                .capabilities
                .lifecycle
                .close
                .require("conversation.close")?;
        }
        let request_id = self.next_request_id();
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            conversation.lifecycle = ConversationLifecycle::Closing;
        }
        let effect = ProtocolEffect::new(self.protocol, self.method_close_conversation())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    pub(super) fn plan_unsubscribe(
        &mut self,
        conversation_id: ConversationId,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            conversation
                .capabilities
                .observer
                .unsubscribe
                .require("observer.unsubscribe")?;
        }
        let request_id = self.next_request_id();
        {
            let conversation = self.conversation_mut(&conversation_id)?;
            conversation.observer.subscribed = false;
        }
        let effect = ProtocolEffect::new(self.protocol, self.method_unsubscribe())
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }

    fn ensure_runtime_available(&self) -> Result<(), EngineError> {
        match self.runtime {
            RuntimeState::Available { .. } => Ok(()),
            _ => Err(EngineError::RuntimeUnavailable {
                actual: format!("{:?}", self.runtime),
            }),
        }
    }
}
