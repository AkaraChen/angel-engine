use std::collections::BTreeMap;

fn capability_unknown() -> CapabilitySupport {
    CapabilitySupport::Unknown
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub enum CapabilitySupport {
    Unsupported,
    Supported,
    Extension { name: String },
    Unknown,
}

impl CapabilitySupport {
    pub fn supported() -> Self {
        Self::Supported
    }

    pub fn extension(name: impl Into<String>) -> Self {
        Self::Extension { name: name.into() }
    }

    pub fn is_supported(&self) -> bool {
        matches!(self, Self::Supported | Self::Extension { .. })
    }

    pub fn require(&self, capability: &str) -> Result<(), crate::EngineError> {
        if self.is_supported() {
            Ok(())
        } else {
            Err(crate::EngineError::CapabilityUnsupported {
                capability: capability.to_string(),
            })
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct RuntimeCapabilities {
    pub name: String,
    pub version: Option<String>,
    pub discovery: CapabilitySupport,
    pub authentication: CapabilitySupport,
    pub metadata: BTreeMap<String, String>,
}

impl RuntimeCapabilities {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            version: None,
            discovery: CapabilitySupport::Unknown,
            authentication: CapabilitySupport::Unknown,
            metadata: BTreeMap::new(),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ConversationCapabilities {
    pub lifecycle: LifecycleCapabilities,
    pub turn: TurnCapabilities,
    pub action: ActionCapabilities,
    pub elicitation: ElicitationCapabilities,
    pub history: HistoryCapabilities,
    pub context: ContextCapabilities,
    pub observer: ObserverCapabilities,
}



#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct LifecycleCapabilities {
    pub create: CapabilitySupport,
    pub list: CapabilitySupport,
    pub load: CapabilitySupport,
    pub resume: CapabilitySupport,
    pub fork: CapabilitySupport,
    pub archive: CapabilitySupport,
    pub close: CapabilitySupport,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct TurnCapabilities {
    pub start: CapabilitySupport,
    pub steer: CapabilitySupport,
    pub cancel: CapabilitySupport,
    pub max_active_turns: usize,
    pub requires_expected_turn_id_for_steer: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ActionCapabilities {
    pub observe: CapabilitySupport,
    pub stream_output: CapabilitySupport,
    pub decline: CapabilitySupport,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ElicitationCapabilities {
    pub approval: CapabilitySupport,
    pub user_input: CapabilitySupport,
    pub external_flow: CapabilitySupport,
    pub dynamic_tool_call: CapabilitySupport,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct HistoryCapabilities {
    pub hydrate: CapabilitySupport,
    pub compact: CapabilitySupport,
    pub rollback: CapabilitySupport,
    pub inject_items: CapabilitySupport,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ContextCapabilities {
    pub mode: CapabilitySupport,
    pub config: CapabilitySupport,
    pub additional_directories: CapabilitySupport,
    pub turn_overrides: CapabilitySupport,
    /// Whether this protocol sends explicit context-update requests (e.g. set_session_model)
    /// when the user changes settings. Protocols that embed context in request fields instead
    /// (e.g. Codex) leave this `Unsupported`; ACP-family protocols set it to `Supported`.
    #[serde(default = "capability_unknown")]
    pub explicit_context_updates: CapabilitySupport,
    /// Whether this conversation supports changing the model via the settings API.
    #[serde(default = "capability_unknown")]
    pub model: CapabilitySupport,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ObserverCapabilities {
    pub unsubscribe: CapabilitySupport,
}
