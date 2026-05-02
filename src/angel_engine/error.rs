use std::error::Error;
use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ErrorInfo {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

impl ErrorInfo {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            recoverable: false,
        }
    }

    pub fn recoverable(mut self, recoverable: bool) -> Self {
        self.recoverable = recoverable;
        self
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EngineError {
    RuntimeUnavailable { actual: String },
    ConversationNotFound { conversation_id: String },
    TurnNotFound { turn_id: String },
    ActionNotFound { action_id: String },
    ElicitationNotFound { elicitation_id: String },
    CapabilityUnsupported { capability: String },
    InvalidState { expected: String, actual: String },
    StaleEvent { message: String },
    DuplicateId { id: String },
    MissingActiveTurn { conversation_id: String },
    InvalidCommand { message: String },
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RuntimeUnavailable { actual } => {
                write!(f, "runtime is not available: {actual}")
            }
            Self::ConversationNotFound { conversation_id } => {
                write!(f, "conversation not found: {conversation_id}")
            }
            Self::TurnNotFound { turn_id } => write!(f, "turn not found: {turn_id}"),
            Self::ActionNotFound { action_id } => write!(f, "action not found: {action_id}"),
            Self::ElicitationNotFound { elicitation_id } => {
                write!(f, "elicitation not found: {elicitation_id}")
            }
            Self::CapabilityUnsupported { capability } => {
                write!(f, "capability unsupported: {capability}")
            }
            Self::InvalidState { expected, actual } => {
                write!(f, "invalid state: expected {expected}, got {actual}")
            }
            Self::StaleEvent { message } => write!(f, "stale event: {message}"),
            Self::DuplicateId { id } => write!(f, "duplicate id: {id}"),
            Self::MissingActiveTurn { conversation_id } => {
                write!(f, "missing active turn for conversation: {conversation_id}")
            }
            Self::InvalidCommand { message } => write!(f, "invalid command: {message}"),
        }
    }
}

impl Error for EngineError {}
