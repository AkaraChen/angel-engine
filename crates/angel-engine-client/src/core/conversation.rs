use angel_engine::{
    AuthMethodId, ContextPatch, DiscoverConversationsParams, ElicitationId, EngineCommand,
    EngineExtensionCommand, HistoryMutationOp, ResumeTarget, StartConversationParams,
    TurnOverrides, UserInput,
};
use angel_provider::ProtocolAdapter;

use crate::config::StartConversationRequest;
use crate::error::ClientResult;
use crate::thread::ThreadEvent;

use super::AngelClientCore;
use super::resolution::{to_conversation_id, to_turn_id};
use super::types::{
    ClientCommandResult, ClientInput, DiscoveryRequest, ElicitationResponse,
    ForkConversationRequest, ResumeConversationRequest,
};

impl<A> AngelClientCore<A>
where
    A: ProtocolAdapter,
{
    pub fn initialize(&mut self) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::Initialize)
    }

    pub fn authenticate(
        &mut self,
        method_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::Authenticate {
            method: AuthMethodId::new(method_id.into()),
        })
    }

    pub fn discover_conversations(
        &mut self,
        request: DiscoveryRequest,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::DiscoverConversations {
            params: DiscoverConversationsParams {
                cwd: request.cwd,
                additional_directories: request.additional_directories,
                cursor: request.cursor,
            },
        })
    }

    pub fn start_conversation(
        &mut self,
        request: StartConversationRequest,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::StartConversation {
            params: StartConversationParams {
                cwd: request.cwd,
                additional_directories: request.additional_directories,
                context: ContextPatch::empty(),
            },
        })
    }

    pub fn resume_conversation(
        &mut self,
        request: ResumeConversationRequest,
    ) -> ClientResult<ClientCommandResult> {
        let target = if request.additional_directories.is_empty() {
            ResumeTarget::Remote {
                id: request.remote_id,
                hydrate: request.hydrate,
                cwd: request.cwd,
            }
        } else {
            ResumeTarget::RemoteWithContext {
                id: request.remote_id,
                hydrate: request.hydrate,
                cwd: request.cwd,
                additional_directories: request.additional_directories,
            }
        };
        self.plan_command(EngineCommand::ResumeConversation { target })
    }

    pub fn read_conversation(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::ReadConversation {
            conversation_id: to_conversation_id(conversation_id),
        })
    }

    pub fn fork_conversation(
        &mut self,
        request: ForkConversationRequest,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::ForkConversation {
            source: to_conversation_id(request.source_conversation_id),
            at: request.at_turn_id.map(to_turn_id),
        })
    }

    pub fn close_conversation(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::CloseConversation {
            conversation_id: to_conversation_id(conversation_id),
        })
    }

    pub fn unsubscribe(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::Unsubscribe {
            conversation_id: to_conversation_id(conversation_id),
        })
    }

    pub fn archive_conversation(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::ArchiveConversation {
            conversation_id: to_conversation_id(conversation_id),
        })
    }

    pub fn unarchive_conversation(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::UnarchiveConversation {
            conversation_id: to_conversation_id(conversation_id),
        })
    }

    pub fn compact_history(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::MutateHistory {
            conversation_id: to_conversation_id(conversation_id),
            op: HistoryMutationOp::Compact,
        })
    }

    pub fn rollback_history(
        &mut self,
        conversation_id: impl Into<String>,
        num_turns: usize,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::MutateHistory {
            conversation_id: to_conversation_id(conversation_id),
            op: HistoryMutationOp::Rollback { num_turns },
        })
    }

    pub fn run_shell_command(
        &mut self,
        conversation_id: impl Into<String>,
        command: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::RunShellCommand {
            conversation_id: to_conversation_id(conversation_id),
            command: command.into(),
        })
    }

    pub fn refresh_skills(
        &mut self,
        conversation_id: impl Into<String>,
        force_reload: bool,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::RefreshSkills {
            conversation_id: to_conversation_id(conversation_id),
            force_reload,
        })
    }

    pub fn send_text(
        &mut self,
        conversation_id: impl Into<String>,
        text: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.send_inputs(
            conversation_id,
            vec![ClientInput::Text { text: text.into() }],
        )
    }

    pub fn send_inputs(
        &mut self,
        conversation_id: impl Into<String>,
        input: Vec<ClientInput>,
    ) -> ClientResult<ClientCommandResult> {
        let conversation_id = to_conversation_id(conversation_id);
        let input = input
            .into_iter()
            .map(UserInput::try_from)
            .collect::<ClientResult<Vec<_>>>()?;
        if let Some(interpreted) =
            self.adapter
                .interpret_user_input(&self.engine, &conversation_id, &input)?
        {
            let mut result = self.plan_command(interpreted.command)?;
            result.message = interpreted.message;
            return Ok(result);
        }

        self.plan_command(EngineCommand::StartTurn {
            conversation_id,
            input,
            overrides: TurnOverrides::default(),
        })
    }

    pub fn steer_text(
        &mut self,
        conversation_id: impl Into<String>,
        turn_id: Option<String>,
        text: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::SteerTurn {
            conversation_id: to_conversation_id(conversation_id),
            turn_id: turn_id.map(to_turn_id),
            input: vec![UserInput::text(text.into())],
        })
    }

    pub fn cancel_turn(
        &mut self,
        conversation_id: impl Into<String>,
        turn_id: Option<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::CancelTurn {
            conversation_id: to_conversation_id(conversation_id),
            turn_id: turn_id.map(to_turn_id),
        })
    }

    pub fn resolve_elicitation(
        &mut self,
        conversation_id: impl Into<String>,
        elicitation_id: impl Into<String>,
        response: ElicitationResponse,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::ResolveElicitation {
            conversation_id: to_conversation_id(conversation_id),
            elicitation_id: ElicitationId::new(elicitation_id.into()),
            decision: response.into(),
        })
    }

    pub fn send_thread_event(
        &mut self,
        conversation_id: impl Into<String>,
        event: ThreadEvent,
        focused_turn_id: Option<String>,
    ) -> ClientResult<ClientCommandResult> {
        let conversation_id = conversation_id.into();
        match event {
            ThreadEvent::UserMessage { text } => self.send_text(conversation_id, text),
            ThreadEvent::Inputs { input } => self.send_inputs(conversation_id, input),
            ThreadEvent::Steer { text, turn_id } => {
                self.steer_text(conversation_id, turn_id.or(focused_turn_id), text)
            }
            ThreadEvent::Cancel { turn_id } => {
                self.cancel_turn(conversation_id, turn_id.or(focused_turn_id))
            }
            ThreadEvent::SetModel { model } => self.set_model(conversation_id, model),
            ThreadEvent::SetMode { mode } => self.set_mode(conversation_id, mode),
            ThreadEvent::SetPermissionMode { mode } => {
                self.set_permission_mode(conversation_id, mode)
            }
            ThreadEvent::SetReasoningEffort { effort } => {
                self.set_reasoning_effort(conversation_id, effort)
            }
            ThreadEvent::ResolveElicitation {
                elicitation_id,
                response,
            } => self.resolve_elicitation(conversation_id, elicitation_id, response),
            ThreadEvent::ResolveFirstElicitation { response } => {
                let elicitation_id = self.first_open_elicitation_id(&conversation_id)?;
                self.resolve_elicitation(conversation_id, elicitation_id, response)
            }
            ThreadEvent::Fork { at_turn_id } => self.fork_conversation(ForkConversationRequest {
                source_conversation_id: conversation_id,
                at_turn_id,
            }),
            ThreadEvent::Close => self.close_conversation(conversation_id),
            ThreadEvent::Unsubscribe => self.unsubscribe(conversation_id),
            ThreadEvent::Archive => self.archive_conversation(conversation_id),
            ThreadEvent::Unarchive => self.unarchive_conversation(conversation_id),
            ThreadEvent::CompactHistory => self.compact_history(conversation_id),
            ThreadEvent::RollbackHistory { num_turns } => {
                self.rollback_history(conversation_id, num_turns)
            }
            ThreadEvent::RunShellCommand { command } => {
                self.run_shell_command(conversation_id, command)
            }
            ThreadEvent::RefreshSkills { force_reload } => {
                self.refresh_skills(conversation_id, force_reload)
            }
        }
    }

    fn first_open_elicitation_id(&self, conversation_id: &str) -> ClientResult<String> {
        self.open_elicitations(conversation_id)?
            .into_iter()
            .next()
            .map(|elicitation| elicitation.id)
            .ok_or_else(|| crate::ClientError::InvalidInput {
                message: format!("conversation {conversation_id} has no open elicitation"),
            })
    }
}
