use std::error::Error;
use std::fmt;
use std::io;

pub type ClientResult<T> = Result<T, ClientError>;

#[derive(Debug)]
pub enum ClientError {
    Engine(angel_engine::EngineError),
    Json(serde_json::Error),
    Io(io::Error),
    RuntimeFaulted { code: String, message: String },
    Timeout { message: String },
    ChannelClosed,
    InvalidInput { message: String },
}

impl fmt::Display for ClientError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Engine(error) => write!(f, "{error}"),
            Self::Json(error) => write!(f, "{error}"),
            Self::Io(error) => write!(f, "{error}"),
            Self::RuntimeFaulted { code, message } => {
                write!(f, "runtime faulted ({code}): {message}")
            }
            Self::Timeout { message } => write!(f, "timeout: {message}"),
            Self::ChannelClosed => f.write_str("runtime process channel closed"),
            Self::InvalidInput { message } => write!(f, "invalid input: {message}"),
        }
    }
}

impl Error for ClientError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Engine(error) => Some(error),
            Self::Json(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::RuntimeFaulted { .. }
            | Self::Timeout { .. }
            | Self::ChannelClosed
            | Self::InvalidInput { .. } => None,
        }
    }
}

impl From<angel_engine::EngineError> for ClientError {
    fn from(error: angel_engine::EngineError) -> Self {
        Self::Engine(error)
    }
}

impl From<serde_json::Error> for ClientError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<io::Error> for ClientError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
