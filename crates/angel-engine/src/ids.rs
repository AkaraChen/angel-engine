use std::fmt;

macro_rules! id_type {
    ($name:ident) => {
        #[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name(String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }

            pub fn into_string(self) -> String {
                self.0
            }
        }

        impl From<&str> for $name {
            fn from(value: &str) -> Self {
                Self::new(value)
            }
        }

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self::new(value)
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(&self.0)
            }
        }
    };
}

id_type!(ConversationId);
id_type!(TurnId);
id_type!(ActionId);
id_type!(ElicitationId);
id_type!(AuthMethodId);

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum JsonRpcRequestId {
    String(String),
    Number(String),
    Null,
    Other(String),
}

impl JsonRpcRequestId {
    pub fn new(value: impl Into<String>) -> Self {
        Self::String(value.into())
    }

    pub fn number(value: impl Into<String>) -> Self {
        Self::Number(value.into())
    }

    pub fn null() -> Self {
        Self::Null
    }

    pub fn other(value: impl Into<String>) -> Self {
        Self::Other(value.into())
    }

    pub fn from_json_value(value: &serde_json::Value) -> Self {
        match value {
            serde_json::Value::String(value) => Self::String(value.clone()),
            serde_json::Value::Number(value) => Self::Number(value.to_string()),
            serde_json::Value::Null => Self::Null,
            other => Self::Other(other.to_string()),
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            Self::String(value) | Self::Number(value) | Self::Other(value) => value,
            Self::Null => "null",
        }
    }

    pub fn into_string(self) -> String {
        match self {
            Self::String(value) | Self::Number(value) | Self::Other(value) => value,
            Self::Null => "null".to_string(),
        }
    }

    pub fn to_json_value(&self) -> serde_json::Value {
        match self {
            Self::String(value) => serde_json::Value::String(value.clone()),
            Self::Number(value) => serde_json::from_str(value)
                .unwrap_or_else(|_| serde_json::Value::String(value.clone())),
            Self::Null => serde_json::Value::Null,
            Self::Other(value) => serde_json::Value::String(value.clone()),
        }
    }
}

impl From<&str> for JsonRpcRequestId {
    fn from(value: &str) -> Self {
        Self::new(value)
    }
}

impl From<String> for JsonRpcRequestId {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

impl fmt::Display for JsonRpcRequestId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RemoteConversationId {
    AcpSession(String),
    CodexThread(String),
    Pending(String),
    Local(String),
}

impl RemoteConversationId {
    pub fn as_protocol_id(&self) -> Option<&str> {
        match self {
            Self::AcpSession(value) | Self::CodexThread(value) | Self::Local(value) => Some(value),
            Self::Pending(_) => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RemoteTurnId {
    AcpLocal {
        session_id: String,
        prompt_request_id: Option<JsonRpcRequestId>,
        user_message_id: Option<String>,
        sequence: u64,
    },
    CodexTurn(String),
    Pending {
        protocol: &'static str,
        request_id: JsonRpcRequestId,
    },
    Local(String),
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RemoteActionId {
    AcpToolCall(String),
    CodexItem(String),
    CodexDynamicCall(String),
    Local(String),
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RemoteRequestId {
    Acp(JsonRpcRequestId),
    Codex(JsonRpcRequestId),
    Local(String),
}
