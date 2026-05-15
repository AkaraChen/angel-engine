use crate::command::{EngineCommand, EngineExtensionCommand};
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
            EngineCommand::ReadConversation { conversation_id } => {
                self.plan_read_conversation(conversation_id)
            }
            EngineCommand::StartConversation { params } => self.plan_start_conversation(params),
            EngineCommand::ResumeConversation { target } => self.plan_resume_conversation(target),
            EngineCommand::StartTurn {
                conversation_id,
                input,
                overrides,
            } => self.plan_start_turn(conversation_id, input, overrides),
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
            EngineCommand::Extension(extension) => self.plan_extension_command(extension),
        }
    }

    fn plan_extension_command(
        &mut self,
        command: EngineExtensionCommand,
    ) -> Result<CommandPlan, EngineError> {
        match command {
            EngineExtensionCommand::ForkConversation { source, at } => {
                self.plan_fork_conversation(source, at)
            }
            EngineExtensionCommand::ReadConversation { conversation_id } => {
                self.plan_read_conversation(conversation_id)
            }
            EngineExtensionCommand::SteerTurn {
                conversation_id,
                turn_id,
                input,
            } => self.plan_steer_turn(conversation_id, turn_id, input),
            EngineExtensionCommand::MutateHistory {
                conversation_id,
                op,
            } => self.plan_mutate_history(conversation_id, op),
            EngineExtensionCommand::RunShellCommand {
                conversation_id,
                command,
            } => self.plan_run_shell_command(conversation_id, command),
            EngineExtensionCommand::ArchiveConversation { conversation_id } => {
                self.plan_archive_conversation(conversation_id, true)
            }
            EngineExtensionCommand::UnarchiveConversation { conversation_id } => {
                self.plan_archive_conversation(conversation_id, false)
            }
            EngineExtensionCommand::CloseConversation { conversation_id } => {
                self.plan_close_conversation(conversation_id)
            }
            EngineExtensionCommand::Unsubscribe { conversation_id } => {
                self.plan_unsubscribe(conversation_id)
            }
        }
    }
}
