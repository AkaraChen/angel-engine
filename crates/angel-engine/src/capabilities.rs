use std::collections::BTreeMap;

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

impl ConversationCapabilities {
    pub fn unknown() -> Self {
        Self {
            lifecycle: LifecycleCapabilities {
                create: CapabilitySupport::Unknown,
                list: CapabilitySupport::Unknown,
                load: CapabilitySupport::Unknown,
                resume: CapabilitySupport::Unknown,
                fork: CapabilitySupport::Unknown,
                archive: CapabilitySupport::Unknown,
                close: CapabilitySupport::Unknown,
            },
            turn: TurnCapabilities {
                start: CapabilitySupport::Unknown,
                steer: CapabilitySupport::Unknown,
                cancel: CapabilitySupport::Unknown,
                max_active_turns: 1,
                requires_expected_turn_id_for_steer: false,
            },
            action: ActionCapabilities {
                observe: CapabilitySupport::Unknown,
                stream_output: CapabilitySupport::Unknown,
                decline: CapabilitySupport::Unknown,
            },
            elicitation: ElicitationCapabilities {
                approval: CapabilitySupport::Unknown,
                user_input: CapabilitySupport::Unknown,
                external_flow: CapabilitySupport::Unknown,
                dynamic_tool_call: CapabilitySupport::Unknown,
            },
            history: HistoryCapabilities {
                hydrate: CapabilitySupport::Unknown,
                compact: CapabilitySupport::Unknown,
                rollback: CapabilitySupport::Unknown,
                inject_items: CapabilitySupport::Unknown,
                shell_command: CapabilitySupport::Unknown,
            },
            context: ContextCapabilities {
                mode: CapabilitySupport::Unknown,
                config: CapabilitySupport::Unknown,
                additional_directories: CapabilitySupport::Unknown,
                turn_overrides: CapabilitySupport::Unknown,
            },
            observer: ObserverCapabilities {
                unsubscribe: CapabilitySupport::Unknown,
            },
        }
    }
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
    pub shell_command: CapabilitySupport,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ContextCapabilities {
    pub mode: CapabilitySupport,
    pub config: CapabilitySupport,
    pub additional_directories: CapabilitySupport,
    pub turn_overrides: CapabilitySupport,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ObserverCapabilities {
    pub unsubscribe: CapabilitySupport,
}
