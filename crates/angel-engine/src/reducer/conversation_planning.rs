use std::collections::BTreeMap;

use crate::command::{ResumeTarget, StartConversationParams};
use crate::error::EngineError;
use crate::ids::{ConversationId, RemoteConversationId, TurnId};
use crate::protocol::{CodexMethod, ProtocolEffect, ProtocolFlavor, ProtocolMethod};
use crate::state::{
    ConversationLifecycle, ConversationState, HydrationSource, ProvisionOp, RuntimeState,
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

    pub(super) fn plan_discover_conversations(&mut self) -> Result<CommandPlan, EngineError> {
        self.ensure_runtime_available()?;
        let request_id = self.next_request_id();
        self.pending
            .insert(request_id.clone(), PendingRequest::DiscoverConversations)?;
        Ok(CommandPlan {
            effects: vec![
                ProtocolEffect::new(self.protocol, self.method_list_conversations())
                    .request_id(request_id.clone()),
            ],
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
        if let Some(service_name) = params.service_name {
            effect = effect.field("serviceName", service_name);
        }
        if params.ephemeral {
            effect = effect.field("ephemeral", "true");
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
        let (conversation_id, remote, op, method, fields) = match target {
            ResumeTarget::Conversation(conversation_id) => {
                let conversation = self.conversation(&conversation_id)?;
                let remote = conversation.remote.clone();
                (
                    conversation_id,
                    remote,
                    ProvisionOp::Resume,
                    self.method_resume_conversation(false),
                    BTreeMap::new(),
                )
            }
            ResumeTarget::AcpSession {
                session_id,
                load_history,
            } => {
                let conversation_id = self.next_conversation_id();
                let mut fields = BTreeMap::new();
                fields.insert("sessionId".to_string(), session_id.clone());
                (
                    conversation_id,
                    RemoteConversationId::AcpSession(session_id),
                    if load_history {
                        ProvisionOp::Load
                    } else {
                        ProvisionOp::Resume
                    },
                    self.method_resume_conversation(load_history),
                    fields,
                )
            }
            ResumeTarget::CodexThread { thread_id } => {
                let conversation_id = self.next_conversation_id();
                let mut fields = BTreeMap::new();
                fields.insert("threadId".to_string(), thread_id.clone());
                (
                    conversation_id,
                    RemoteConversationId::CodexThread(thread_id),
                    ProvisionOp::Resume,
                    self.method_resume_conversation(false),
                    fields,
                )
            }
            ResumeTarget::Path(path) => {
                let conversation_id = self.next_conversation_id();
                let mut fields = BTreeMap::new();
                fields.insert("path".to_string(), path.clone());
                (
                    conversation_id,
                    RemoteConversationId::Pending(path),
                    ProvisionOp::Resume,
                    self.method_resume_conversation(false),
                    fields,
                )
            }
            ResumeTarget::History(history_id) => {
                let conversation_id = self.next_conversation_id();
                let mut fields = BTreeMap::new();
                fields.insert("history".to_string(), history_id.clone());
                (
                    conversation_id,
                    RemoteConversationId::Pending(history_id),
                    ProvisionOp::Resume,
                    self.method_resume_conversation(false),
                    fields,
                )
            }
        };

        let request_id = self.next_request_id();
        let source = if matches!(op, ProvisionOp::Load) {
            HydrationSource::AcpLoad
        } else {
            HydrationSource::CodexResume
        };
        let state = ConversationState::new(
            conversation_id.clone(),
            remote,
            if matches!(op, ProvisionOp::Load) {
                ConversationLifecycle::Hydrating { source }
            } else {
                ConversationLifecycle::Provisioning { op }
            },
            self.default_capabilities.clone(),
        );
        self.conversations.insert(conversation_id.clone(), state);
        self.selected = Some(conversation_id.clone());
        self.pending.insert(
            request_id.clone(),
            PendingRequest::ResumeConversation {
                conversation_id: conversation_id.clone(),
            },
        )?;

        let mut effect = ProtocolEffect::new(self.protocol, method)
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone());
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
