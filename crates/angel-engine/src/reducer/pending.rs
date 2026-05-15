use std::collections::BTreeMap;

use crate::error::EngineError;
use crate::ids::{ConversationId, ElicitationId, JsonRpcRequestId, TurnId};
use crate::state::ContextPatch;
use crate::DiscoverConversationsParams;

#[derive(Clone, Debug, Default)]
pub struct PendingTable {
    pub requests: BTreeMap<JsonRpcRequestId, PendingRequest>,
}

impl PendingTable {
    pub fn insert(
        &mut self,
        request_id: JsonRpcRequestId,
        request: PendingRequest,
    ) -> Result<(), EngineError> {
        if self.requests.contains_key(&request_id) {
            return Err(EngineError::DuplicateId {
                id: request_id.to_string(),
            });
        }
        self.requests.insert(request_id, request);
        Ok(())
    }

    pub fn remove(&mut self, request_id: &JsonRpcRequestId) -> Option<PendingRequest> {
        self.requests.remove(request_id)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PendingRequest {
    Initialize,
    Authenticate,
    DiscoverConversations {
        params: DiscoverConversationsParams,
    },
    ReadConversation {
        conversation_id: ConversationId,
    },
    StartConversation {
        conversation_id: ConversationId,
    },
    ResumeConversation {
        conversation_id: ConversationId,
        hydrate: bool,
    },
    ForkConversation {
        conversation_id: ConversationId,
    },
    StartTurn {
        conversation_id: ConversationId,
        turn_id: TurnId,
    },
    SteerTurn {
        conversation_id: ConversationId,
        turn_id: TurnId,
    },
    CancelTurn {
        conversation_id: ConversationId,
        turn_id: TurnId,
    },
    ResolveElicitation {
        conversation_id: ConversationId,
        elicitation_id: ElicitationId,
    },
    UpdateContext {
        conversation_id: ConversationId,
        patch: ContextPatch,
    },
    HistoryMutation {
        conversation_id: ConversationId,
    },
    RunShellCommand {
        conversation_id: ConversationId,
    },
}
