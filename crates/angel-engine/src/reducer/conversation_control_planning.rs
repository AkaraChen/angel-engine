use crate::error::EngineError;
use crate::ids::ConversationId;
use crate::protocol::ProtocolEffect;
use crate::state::ConversationLifecycle;

use super::{AngelEngine, CommandPlan};

impl AngelEngine {
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
        let method = self.method_archive_conversation(archive);
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
}
