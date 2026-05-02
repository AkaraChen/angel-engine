use crate::capabilities::RuntimeCapabilities;
use crate::error::ErrorInfo;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuntimeState {
    Offline,
    Connecting,
    Negotiating,
    AwaitingAuth { methods: Vec<AuthMethod> },
    Available { capabilities: RuntimeCapabilities },
    Faulted(ErrorInfo),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthMethod {
    pub id: crate::AuthMethodId,
    pub label: String,
}
