use crate::capabilities::CapabilitySupport;
use crate::error::EngineError;
use crate::ids::ConversationId;
use crate::protocol::{AcpMethod, CodexMethod, ProtocolFlavor, ProtocolMethod};
use crate::state::HistoryMutationOp;

use super::AngelEngine;

impl AngelEngine {
    pub(super) fn method_initialize(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::Initialize),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::Initialize),
        }
    }

    pub(super) fn method_authenticate(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::Authenticate),
            ProtocolFlavor::CodexAppServer => {
                ProtocolMethod::Extension("account/login/start".to_string())
            }
        }
    }

    pub(super) fn method_list_conversations(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionList),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ThreadList),
        }
    }

    pub(super) fn method_start_conversation(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionNew),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ThreadStart),
        }
    }

    pub(super) fn method_resume_conversation(&self, load_history: bool) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp if load_history => ProtocolMethod::Acp(AcpMethod::SessionLoad),
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionResume),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ThreadResume),
        }
    }

    pub(super) fn method_fork_conversation(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Extension("session/fork".to_string()),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ThreadFork),
        }
    }

    pub(super) fn method_start_turn(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionPrompt),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::TurnStart),
        }
    }

    pub(super) fn method_steer_turn(
        &self,
        conversation_id: &ConversationId,
    ) -> Result<ProtocolMethod, EngineError> {
        match self.protocol {
            ProtocolFlavor::CodexAppServer => Ok(ProtocolMethod::Codex(CodexMethod::TurnSteer)),
            ProtocolFlavor::Acp => {
                let conversation = self.conversation(conversation_id)?;
                match &conversation.capabilities.turn.steer {
                    CapabilitySupport::Extension { name } => {
                        Ok(ProtocolMethod::Extension(name.clone()))
                    }
                    CapabilitySupport::Supported => {
                        Ok(ProtocolMethod::Extension("session/steer".to_string()))
                    }
                    other => Err(EngineError::CapabilityUnsupported {
                        capability: format!("turn.steer ({other:?})"),
                    }),
                }
            }
        }
    }

    pub(super) fn method_cancel_turn(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionCancel),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::TurnInterrupt),
        }
    }

    pub(super) fn method_resolve_elicitation(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::RequestPermissionResponse),
            ProtocolFlavor::CodexAppServer => {
                ProtocolMethod::Codex(CodexMethod::ServerRequestResponse)
            }
        }
    }

    pub(super) fn method_history_mutation(&self, op: &HistoryMutationOp) -> ProtocolMethod {
        match (self.protocol, op) {
            (ProtocolFlavor::CodexAppServer, HistoryMutationOp::Compact) => {
                ProtocolMethod::Codex(CodexMethod::ThreadCompactStart)
            }
            (ProtocolFlavor::CodexAppServer, HistoryMutationOp::Rollback { .. }) => {
                ProtocolMethod::Codex(CodexMethod::ThreadRollback)
            }
            (ProtocolFlavor::CodexAppServer, HistoryMutationOp::InjectItems { .. }) => {
                ProtocolMethod::Codex(CodexMethod::ThreadInjectItems)
            }
            _ => ProtocolMethod::Extension("history/mutate".to_string()),
        }
    }

    pub(super) fn method_close_conversation(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Acp(AcpMethod::SessionClose),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Extension("thread/close".to_string()),
        }
    }

    pub(super) fn method_unsubscribe(&self) -> ProtocolMethod {
        match self.protocol {
            ProtocolFlavor::Acp => ProtocolMethod::Extension("session/unsubscribe".to_string()),
            ProtocolFlavor::CodexAppServer => ProtocolMethod::Codex(CodexMethod::ThreadUnsubscribe),
        }
    }
}
