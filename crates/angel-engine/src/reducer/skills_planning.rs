use crate::error::EngineError;
use crate::ids::ConversationId;
use crate::protocol::{ProtocolEffect, ProtocolMethod};

use super::{AngelEngine, CommandPlan, PendingRequest};

impl AngelEngine {
    pub(super) fn plan_refresh_skills(
        &mut self,
        conversation_id: ConversationId,
        force_reload: bool,
    ) -> Result<CommandPlan, EngineError> {
        {
            let conversation = self.conversation(&conversation_id)?;
            conversation
                .capabilities
                .skills
                .list
                .require("skills.list")?;
        }

        let request_id = self.next_request_id();
        self.pending.insert(
            request_id.clone(),
            PendingRequest::RefreshSkills {
                conversation_id: conversation_id.clone(),
            },
        )?;

        let effect = ProtocolEffect::new(self.protocol, ProtocolMethod::ListSkills)
            .request_id(request_id.clone())
            .conversation_id(conversation_id.clone())
            .field("forceReload", force_reload.to_string());

        Ok(CommandPlan {
            effects: vec![effect],
            conversation_id: Some(conversation_id),
            request_id: Some(request_id),
            ..CommandPlan::default()
        })
    }
}
