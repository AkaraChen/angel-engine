use crate::error::EngineError;
use crate::protocol::ProtocolEffect;
use crate::state::RuntimeState;

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
}
