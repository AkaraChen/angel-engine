use crate::command::EngineCommand;
use crate::error::EngineError;

use super::{AngelEngine, CommandPlan};

impl AngelEngine {
    pub fn plan_command(&mut self, command: EngineCommand) -> Result<CommandPlan, EngineError> {
        match command {
            EngineCommand::Initialize => self.plan_initialize(),
            EngineCommand::Authenticate { method } => self.plan_authenticate(method),
            EngineCommand::DiscoverConversations { params } => {
                self.plan_discover_conversations(params)
            }
            EngineCommand::StartConversation { params } => self.plan_start_conversation(params),
            EngineCommand::ResumeConversation { target } => self.plan_resume_conversation(target),
            EngineCommand::ForkConversation { source, at } => {
                self.plan_fork_conversation(source, at)
            }
            EngineCommand::StartTurn {
                conversation_id,
                input,
                overrides,
            } => self.plan_start_turn(conversation_id, input, overrides),
            EngineCommand::SteerTurn {
                conversation_id,
                turn_id,
                input,
            } => self.plan_steer_turn(conversation_id, turn_id, input),
            EngineCommand::CancelTurn {
                conversation_id,
                turn_id,
            } => self.plan_cancel_turn(conversation_id, turn_id),
            EngineCommand::ResolveElicitation {
                conversation_id,
                elicitation_id,
                decision,
            } => self.plan_resolve_elicitation(conversation_id, elicitation_id, decision),
            EngineCommand::UpdateContext {
                conversation_id,
                patch,
            } => self.plan_update_context(conversation_id, patch),
            EngineCommand::MutateHistory {
                conversation_id,
                op,
            } => self.plan_mutate_history(conversation_id, op),
            EngineCommand::RunShellCommand {
                conversation_id,
                command,
            } => self.plan_run_shell_command(conversation_id, command),
            EngineCommand::ArchiveConversation { conversation_id } => {
                self.plan_archive_conversation(conversation_id, true)
            }
            EngineCommand::UnarchiveConversation { conversation_id } => {
                self.plan_archive_conversation(conversation_id, false)
            }
            EngineCommand::CloseConversation { conversation_id } => {
                self.plan_close_conversation(conversation_id)
            }
            EngineCommand::Unsubscribe { conversation_id } => {
                self.plan_unsubscribe(conversation_id)
            }
        }
    }
}
