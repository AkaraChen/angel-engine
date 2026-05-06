use crate::capabilities::RuntimeCapabilities;
use crate::error::ErrorInfo;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum RuntimeState {
    Offline,
    Connecting,
    Negotiating,
    AwaitingAuth { methods: Vec<AuthMethod> },
    Available { capabilities: RuntimeCapabilities },
    Faulted(ErrorInfo),
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct AuthMethod {
    pub id: crate::AuthMethodId,
    pub label: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct ConversationDiscoveryState {
    pub cursor: Option<String>,
    pub next_cursor: Option<String>,
}
