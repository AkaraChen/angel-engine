use std::fmt;

macro_rules! id_type {
    ($name:ident) => {
        #[derive(
            serde::Serialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, garde::Validate,
        )]
        #[garde(transparent)]
        pub struct $name(#[garde(length(min = 1))] String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                let id = Self(value.into());
                <Self as garde::Validate>::validate(&id)
                    .expect(concat!(stringify!($name), " must not be empty"));
                id
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

        impl<'de> serde::Deserialize<'de> for $name {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                let id = Self(String::deserialize(deserializer)?);
                <Self as garde::Validate>::validate(&id).map_err(serde::de::Error::custom)?;
                Ok(id)
            }
        }
    };
}

id_type!(ConversationId);
id_type!(TurnId);
id_type!(ActionId);
id_type!(ElicitationId);
id_type!(AuthMethodId);

#[derive(
    serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash,
)]
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

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, garde::Validate)]
pub enum RemoteConversationId {
    Known(#[garde(length(min = 1))] String),
    Pending(#[garde(length(min = 1))] String),
    Local(#[garde(length(min = 1))] String),
}

impl RemoteConversationId {
    pub fn as_protocol_id(&self) -> Option<&str> {
        match self {
            Self::Known(value) | Self::Local(value) => Some(value),
            Self::Pending(_) => None,
        }
    }
}

impl<'de> serde::Deserialize<'de> for RemoteConversationId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(serde::Deserialize)]
        enum RemoteConversationIdJson {
            Known(String),
            Pending(String),
            Local(String),
        }

        let id = match RemoteConversationIdJson::deserialize(deserializer)? {
            RemoteConversationIdJson::Known(value) => Self::Known(value),
            RemoteConversationIdJson::Pending(value) => Self::Pending(value),
            RemoteConversationIdJson::Local(value) => Self::Local(value),
        };
        <Self as garde::Validate>::validate(&id).map_err(serde::de::Error::custom)?;
        Ok(id)
    }
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, garde::Validate)]
pub enum RemoteTurnId {
    Known(#[garde(length(min = 1))] String),
    Pending {
        #[garde(skip)]
        request_id: JsonRpcRequestId,
    },
    Local(#[garde(length(min = 1))] String),
}

impl<'de> serde::Deserialize<'de> for RemoteTurnId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(serde::Deserialize)]
        enum RemoteTurnIdJson {
            Known(String),
            Pending { request_id: JsonRpcRequestId },
            Local(String),
        }

        let id = match RemoteTurnIdJson::deserialize(deserializer)? {
            RemoteTurnIdJson::Known(value) => Self::Known(value),
            RemoteTurnIdJson::Pending { request_id } => Self::Pending { request_id },
            RemoteTurnIdJson::Local(value) => Self::Local(value),
        };
        <Self as garde::Validate>::validate(&id).map_err(serde::de::Error::custom)?;
        Ok(id)
    }
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, garde::Validate)]
pub enum RemoteActionId {
    Known(#[garde(length(min = 1))] String),
    Local(#[garde(length(min = 1))] String),
}

impl<'de> serde::Deserialize<'de> for RemoteActionId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(serde::Deserialize)]
        enum RemoteActionIdJson {
            Known(String),
            Local(String),
        }

        let id = match RemoteActionIdJson::deserialize(deserializer)? {
            RemoteActionIdJson::Known(value) => Self::Known(value),
            RemoteActionIdJson::Local(value) => Self::Local(value),
        };
        <Self as garde::Validate>::validate(&id).map_err(serde::de::Error::custom)?;
        Ok(id)
    }
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, garde::Validate)]
pub enum RemoteRequestId {
    JsonRpc(#[garde(skip)] JsonRpcRequestId),
    Local(#[garde(length(min = 1))] String),
}

impl<'de> serde::Deserialize<'de> for RemoteRequestId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(serde::Deserialize)]
        enum RemoteRequestIdJson {
            JsonRpc(JsonRpcRequestId),
            Local(String),
        }

        let id = match RemoteRequestIdJson::deserialize(deserializer)? {
            RemoteRequestIdJson::JsonRpc(value) => Self::JsonRpc(value),
            RemoteRequestIdJson::Local(value) => Self::Local(value),
        };
        <Self as garde::Validate>::validate(&id).map_err(serde::de::Error::custom)?;
        Ok(id)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ActionId, ConversationId, RemoteActionId, RemoteConversationId, RemoteRequestId,
        RemoteTurnId, TurnId,
    };

    #[test]
    fn typed_ids_reject_empty_strings() {
        assert!(std::panic::catch_unwind(|| ConversationId::new("")).is_err());
        assert!(std::panic::catch_unwind(|| TurnId::new("")).is_err());
        assert!(std::panic::catch_unwind(|| ActionId::new("")).is_err());

        assert!(serde_json::from_str::<ConversationId>(r#""""#).is_err());
        assert!(serde_json::from_str::<TurnId>(r#""""#).is_err());
        assert!(serde_json::from_str::<ActionId>(r#""""#).is_err());
    }

    #[test]
    fn remote_ids_reject_empty_strings_on_deserialize() {
        assert!(serde_json::from_str::<RemoteConversationId>(r#"{"Known":""}"#).is_err());
        assert!(serde_json::from_str::<RemoteConversationId>(r#"{"Pending":""}"#).is_err());
        assert!(serde_json::from_str::<RemoteTurnId>(r#"{"Known":""}"#).is_err());
        assert!(serde_json::from_str::<RemoteTurnId>(r#"{"Local":""}"#).is_err());
        assert!(serde_json::from_str::<RemoteActionId>(r#"{"Known":""}"#).is_err());
        assert!(serde_json::from_str::<RemoteRequestId>(r#"{"Local":""}"#).is_err());
    }
}
