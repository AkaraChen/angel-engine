use serde::{Deserialize, Serialize};

use crate::client::Client;
use crate::core::{
    ClientAnswer, ClientCommandResult, ClientInput, ElicitationResponse, ForkConversationRequest,
};
use crate::error::{ClientError, ClientResult};
use crate::snapshot::{ConversationSnapshot, ElicitationSnapshot, TurnSnapshot};

pub type Conversation<'a> = Thread<'a>;

pub struct Thread<'a> {
    client: &'a mut Client,
    conversation_id: String,
}

impl<'a> Thread<'a> {
    pub(crate) fn new(client: &'a mut Client, conversation_id: String) -> Self {
        Self {
            client,
            conversation_id,
        }
    }

    pub fn id(&self) -> &str {
        &self.conversation_id
    }

    pub fn state(&self) -> Option<ConversationSnapshot> {
        self.client
            .snapshot()
            .conversations
            .into_iter()
            .find(|conversation| conversation.id == self.conversation_id)
    }

    pub fn require_state(&self) -> ClientResult<ConversationSnapshot> {
        self.state().ok_or_else(|| ClientError::InvalidInput {
            message: format!("conversation {} was not found", self.conversation_id),
        })
    }

    pub fn focused_turn_id(&self) -> Option<String> {
        self.state()
            .and_then(|conversation| conversation.focused_turn_id)
    }

    pub fn focused_turn(&self) -> Option<TurnSnapshot> {
        let state = self.state()?;
        let turn_id = state.focused_turn_id.as_ref()?;
        state.turns.into_iter().find(|turn| &turn.id == turn_id)
    }

    pub fn turn(&self, turn_id: &str) -> Option<TurnSnapshot> {
        self.state()?
            .turns
            .into_iter()
            .find(|turn| turn.id == turn_id)
    }

    pub fn open_elicitations(&self) -> Vec<ElicitationSnapshot> {
        self.client.core.open_elicitations(&self.conversation_id)
    }

    pub fn send_event(&mut self, event: ThreadEvent) -> ClientResult<ClientCommandResult> {
        match event {
            ThreadEvent::UserMessage { text } => self
                .client
                .core
                .send_text(self.conversation_id.clone(), text),
            ThreadEvent::Inputs { input } => self
                .client
                .core
                .send_inputs(self.conversation_id.clone(), input),
            ThreadEvent::Steer { text, turn_id } => {
                let turn_id = turn_id.or_else(|| self.focused_turn_id());
                self.client
                    .core
                    .steer_text(self.conversation_id.clone(), turn_id, text)
            }
            ThreadEvent::Cancel { turn_id } => {
                let turn_id = turn_id.or_else(|| self.focused_turn_id());
                self.client
                    .core
                    .cancel_turn(self.conversation_id.clone(), turn_id)
            }
            ThreadEvent::SetModel { model } => self
                .client
                .core
                .set_model(self.conversation_id.clone(), model),
            ThreadEvent::SetMode { mode } => self
                .client
                .core
                .set_mode(self.conversation_id.clone(), mode),
            ThreadEvent::SetReasoningEffort { effort } => self
                .client
                .core
                .set_reasoning_effort(self.conversation_id.clone(), effort),
            ThreadEvent::ResolveElicitation {
                elicitation_id,
                response,
            } => self.client.core.resolve_elicitation(
                self.conversation_id.clone(),
                elicitation_id,
                response,
            ),
            ThreadEvent::ResolveFirstElicitation { response } => {
                let elicitation_id = self.first_open_elicitation_id()?;
                self.client.core.resolve_elicitation(
                    self.conversation_id.clone(),
                    elicitation_id,
                    response,
                )
            }
            ThreadEvent::Fork { at_turn_id } => {
                self.client.core.fork_conversation(ForkConversationRequest {
                    source_conversation_id: self.conversation_id.clone(),
                    at_turn_id,
                })
            }
            ThreadEvent::Close => self
                .client
                .core
                .close_conversation(self.conversation_id.clone()),
            ThreadEvent::Unsubscribe => self.client.core.unsubscribe(self.conversation_id.clone()),
            ThreadEvent::Archive => self
                .client
                .core
                .archive_conversation(self.conversation_id.clone()),
            ThreadEvent::Unarchive => self
                .client
                .core
                .unarchive_conversation(self.conversation_id.clone()),
            ThreadEvent::CompactHistory => self
                .client
                .core
                .compact_history(self.conversation_id.clone()),
            ThreadEvent::RollbackHistory { num_turns } => self
                .client
                .core
                .rollback_history(self.conversation_id.clone(), num_turns),
            ThreadEvent::RunShellCommand { command } => self
                .client
                .core
                .run_shell_command(self.conversation_id.clone(), command),
        }
    }

    fn first_open_elicitation_id(&self) -> ClientResult<String> {
        self.open_elicitations()
            .into_iter()
            .next()
            .map(|elicitation| elicitation.id)
            .ok_or_else(|| ClientError::InvalidInput {
                message: format!(
                    "conversation {} has no open elicitation",
                    self.conversation_id
                ),
            })
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ThreadEvent {
    UserMessage {
        text: String,
    },
    Inputs {
        input: Vec<ClientInput>,
    },
    Steer {
        text: String,
        #[serde(default)]
        turn_id: Option<String>,
    },
    Cancel {
        #[serde(default)]
        turn_id: Option<String>,
    },
    SetModel {
        model: String,
    },
    SetMode {
        mode: String,
    },
    SetReasoningEffort {
        effort: String,
    },
    ResolveElicitation {
        elicitation_id: String,
        response: ElicitationResponse,
    },
    ResolveFirstElicitation {
        response: ElicitationResponse,
    },
    Fork {
        #[serde(default)]
        at_turn_id: Option<String>,
    },
    Close,
    Unsubscribe,
    Archive,
    Unarchive,
    CompactHistory,
    RollbackHistory {
        num_turns: usize,
    },
    RunShellCommand {
        command: String,
    },
}

impl ThreadEvent {
    pub fn text(text: impl Into<String>) -> Self {
        Self::UserMessage { text: text.into() }
    }

    pub fn input(input: impl IntoIterator<Item = ClientInput>) -> Self {
        Self::Inputs {
            input: input.into_iter().collect(),
        }
    }

    pub fn steer(text: impl Into<String>) -> Self {
        Self::Steer {
            text: text.into(),
            turn_id: None,
        }
    }

    pub fn steer_turn(turn_id: impl Into<String>, text: impl Into<String>) -> Self {
        Self::Steer {
            text: text.into(),
            turn_id: Some(turn_id.into()),
        }
    }

    pub fn cancel() -> Self {
        Self::Cancel { turn_id: None }
    }

    pub fn cancel_turn(turn_id: impl Into<String>) -> Self {
        Self::Cancel {
            turn_id: Some(turn_id.into()),
        }
    }

    pub fn set_model(model: impl Into<String>) -> Self {
        Self::SetModel {
            model: model.into(),
        }
    }

    pub fn set_mode(mode: impl Into<String>) -> Self {
        Self::SetMode { mode: mode.into() }
    }

    pub fn set_reasoning_effort(effort: impl Into<String>) -> Self {
        Self::SetReasoningEffort {
            effort: effort.into(),
        }
    }

    pub fn resolve(elicitation_id: impl Into<String>, response: ElicitationResponse) -> Self {
        Self::ResolveElicitation {
            elicitation_id: elicitation_id.into(),
            response,
        }
    }

    pub fn resolve_first(response: ElicitationResponse) -> Self {
        Self::ResolveFirstElicitation { response }
    }

    pub fn approve_first() -> Self {
        Self::resolve_first(ElicitationResponse::Allow)
    }

    pub fn deny_first() -> Self {
        Self::resolve_first(ElicitationResponse::Deny)
    }

    pub fn cancel_first_elicitation() -> Self {
        Self::resolve_first(ElicitationResponse::Cancel)
    }

    pub fn answer_first(answers: impl IntoIterator<Item = ClientAnswer>) -> Self {
        Self::resolve_first(ElicitationResponse::Answers {
            answers: answers.into_iter().collect(),
        })
    }

    pub fn fork() -> Self {
        Self::Fork { at_turn_id: None }
    }

    pub fn fork_at(turn_id: impl Into<String>) -> Self {
        Self::Fork {
            at_turn_id: Some(turn_id.into()),
        }
    }

    pub fn rollback_history(num_turns: usize) -> Self {
        Self::RollbackHistory { num_turns }
    }

    pub fn shell(command: impl Into<String>) -> Self {
        Self::RunShellCommand {
            command: command.into(),
        }
    }
}

impl From<String> for ThreadEvent {
    fn from(text: String) -> Self {
        Self::text(text)
    }
}

impl From<&str> for ThreadEvent {
    fn from(text: &str) -> Self {
        Self::text(text)
    }
}

impl ClientAnswer {
    pub fn new(id: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            value: value.into(),
        }
    }
}
