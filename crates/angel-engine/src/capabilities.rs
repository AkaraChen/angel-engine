use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq)]
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

#[derive(Clone, Debug, PartialEq, Eq)]
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

#[derive(Clone, Debug, PartialEq, Eq)]
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
    pub fn acp_standard() -> Self {
        Self {
            lifecycle: LifecycleCapabilities {
                create: CapabilitySupport::Supported,
                list: CapabilitySupport::Supported,
                load: CapabilitySupport::Unknown,
                resume: CapabilitySupport::Unknown,
                fork: CapabilitySupport::Unsupported,
                archive: CapabilitySupport::Unsupported,
                close: CapabilitySupport::Unknown,
            },
            turn: TurnCapabilities {
                start: CapabilitySupport::Supported,
                steer: CapabilitySupport::Unsupported,
                cancel: CapabilitySupport::Supported,
                max_active_turns: 1,
                requires_expected_turn_id_for_steer: false,
            },
            action: ActionCapabilities {
                observe: CapabilitySupport::Supported,
                stream_output: CapabilitySupport::Supported,
                decline: CapabilitySupport::Supported,
            },
            elicitation: ElicitationCapabilities {
                approval: CapabilitySupport::Supported,
                user_input: CapabilitySupport::Unknown,
                external_flow: CapabilitySupport::Unknown,
                dynamic_tool_call: CapabilitySupport::Unknown,
            },
            history: HistoryCapabilities {
                hydrate: CapabilitySupport::Unknown,
                compact: CapabilitySupport::Unsupported,
                rollback: CapabilitySupport::Unsupported,
                inject_items: CapabilitySupport::Unsupported,
            },
            context: ContextCapabilities {
                mode: CapabilitySupport::Unknown,
                config: CapabilitySupport::Unknown,
                turn_overrides: CapabilitySupport::Unsupported,
            },
            observer: ObserverCapabilities {
                unsubscribe: CapabilitySupport::Unsupported,
            },
        }
    }

    pub fn codex_app_server() -> Self {
        Self {
            lifecycle: LifecycleCapabilities {
                create: CapabilitySupport::Supported,
                list: CapabilitySupport::Supported,
                load: CapabilitySupport::Supported,
                resume: CapabilitySupport::Supported,
                fork: CapabilitySupport::Supported,
                archive: CapabilitySupport::Supported,
                close: CapabilitySupport::Unknown,
            },
            turn: TurnCapabilities {
                start: CapabilitySupport::Supported,
                steer: CapabilitySupport::Supported,
                cancel: CapabilitySupport::Supported,
                max_active_turns: 1,
                requires_expected_turn_id_for_steer: true,
            },
            action: ActionCapabilities {
                observe: CapabilitySupport::Supported,
                stream_output: CapabilitySupport::Supported,
                decline: CapabilitySupport::Supported,
            },
            elicitation: ElicitationCapabilities {
                approval: CapabilitySupport::Supported,
                user_input: CapabilitySupport::Supported,
                external_flow: CapabilitySupport::Supported,
                dynamic_tool_call: CapabilitySupport::Supported,
            },
            history: HistoryCapabilities {
                hydrate: CapabilitySupport::Supported,
                compact: CapabilitySupport::Supported,
                rollback: CapabilitySupport::Supported,
                inject_items: CapabilitySupport::Supported,
            },
            context: ContextCapabilities {
                mode: CapabilitySupport::Supported,
                config: CapabilitySupport::Supported,
                turn_overrides: CapabilitySupport::Supported,
            },
            observer: ObserverCapabilities {
                unsubscribe: CapabilitySupport::Supported,
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LifecycleCapabilities {
    pub create: CapabilitySupport,
    pub list: CapabilitySupport,
    pub load: CapabilitySupport,
    pub resume: CapabilitySupport,
    pub fork: CapabilitySupport,
    pub archive: CapabilitySupport,
    pub close: CapabilitySupport,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TurnCapabilities {
    pub start: CapabilitySupport,
    pub steer: CapabilitySupport,
    pub cancel: CapabilitySupport,
    pub max_active_turns: usize,
    pub requires_expected_turn_id_for_steer: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActionCapabilities {
    pub observe: CapabilitySupport,
    pub stream_output: CapabilitySupport,
    pub decline: CapabilitySupport,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ElicitationCapabilities {
    pub approval: CapabilitySupport,
    pub user_input: CapabilitySupport,
    pub external_flow: CapabilitySupport,
    pub dynamic_tool_call: CapabilitySupport,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HistoryCapabilities {
    pub hydrate: CapabilitySupport,
    pub compact: CapabilitySupport,
    pub rollback: CapabilitySupport,
    pub inject_items: CapabilitySupport,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContextCapabilities {
    pub mode: CapabilitySupport,
    pub config: CapabilitySupport,
    pub turn_overrides: CapabilitySupport,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObserverCapabilities {
    pub unsubscribe: CapabilitySupport,
}
