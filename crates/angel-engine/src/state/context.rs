use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct EffectiveContext {
    pub model: ScopedValue<Option<String>>,
    pub reasoning: ScopedValue<Option<ReasoningProfile>>,
    pub mode: ScopedValue<Option<AgentMode>>,
    pub cwd: ScopedValue<Option<PathBuf>>,
    pub additional_directories: ScopedValue<Vec<PathBuf>>,
    pub approvals: ScopedValue<ApprovalPolicy>,
    pub sandbox: ScopedValue<SandboxProfile>,
    pub permissions: ScopedValue<PermissionProfile>,
    pub raw: BTreeMap<String, ScopedValue<String>>,
}

impl EffectiveContext {
    pub fn apply_patch(&mut self, patch: ContextPatch) {
        for update in patch.updates {
            match update {
                ContextUpdate::Model { scope, model } => self.model.set(scope, model),
                ContextUpdate::Reasoning { scope, reasoning } => {
                    self.reasoning.set(scope, reasoning)
                }
                ContextUpdate::Mode { scope, mode } => self.mode.set(scope, mode),
                ContextUpdate::Cwd { scope, cwd } => self.cwd.set(scope, cwd.map(PathBuf::from)),
                ContextUpdate::AdditionalDirectories { scope, directories } => self
                    .additional_directories
                    .set(scope, directories.into_iter().map(PathBuf::from).collect()),
                ContextUpdate::ApprovalPolicy { scope, policy } => {
                    self.approvals.set(scope, policy)
                }
                ContextUpdate::Sandbox { scope, sandbox } => self.sandbox.set(scope, sandbox),
                ContextUpdate::Permissions { scope, permissions } => {
                    self.permissions.set(scope, permissions)
                }
                ContextUpdate::Raw { scope, key, value } => {
                    self.raw.entry(key).or_default().set(scope, value);
                }
            }
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ScopedValue<T> {
    pub runtime_default: Option<T>,
    pub conversation: Option<T>,
    pub turn_and_future: Option<T>,
    pub current_turn: Option<T>,
    pub temporary: Vec<T>,
}

impl<T> ScopedValue<T> {
    pub fn set(&mut self, scope: ContextScope, value: T) {
        match scope {
            ContextScope::RuntimeDefault => self.runtime_default = Some(value),
            ContextScope::Conversation => self.conversation = Some(value),
            ContextScope::TurnAndFuture => self.turn_and_future = Some(value),
            ContextScope::CurrentTurn => self.current_turn = Some(value),
            ContextScope::TemporaryGrant => self.temporary.push(value),
        }
    }

    pub fn effective(&self) -> Option<&T> {
        self.temporary
            .last()
            .or(self.current_turn.as_ref())
            .or(self.turn_and_future.as_ref())
            .or(self.conversation.as_ref())
            .or(self.runtime_default.as_ref())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContextScope {
    RuntimeDefault,
    Conversation,
    TurnAndFuture,
    CurrentTurn,
    TemporaryGrant,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ContextPatch {
    pub updates: Vec<ContextUpdate>,
}

impl ContextPatch {
    pub fn empty() -> Self {
        Self {
            updates: Vec::new(),
        }
    }

    pub fn one(update: ContextUpdate) -> Self {
        Self {
            updates: vec![update],
        }
    }

    pub fn is_empty(&self) -> bool {
        self.updates.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ContextUpdate {
    Model {
        scope: ContextScope,
        model: Option<String>,
    },
    Reasoning {
        scope: ContextScope,
        reasoning: Option<ReasoningProfile>,
    },
    Mode {
        scope: ContextScope,
        mode: Option<AgentMode>,
    },
    Cwd {
        scope: ContextScope,
        cwd: Option<String>,
    },
    AdditionalDirectories {
        scope: ContextScope,
        directories: Vec<String>,
    },
    ApprovalPolicy {
        scope: ContextScope,
        policy: ApprovalPolicy,
    },
    Sandbox {
        scope: ContextScope,
        sandbox: SandboxProfile,
    },
    Permissions {
        scope: ContextScope,
        permissions: PermissionProfile,
    },
    Raw {
        scope: ContextScope,
        key: String,
        value: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReasoningProfile {
    pub effort: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentMode {
    pub id: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum ApprovalPolicy {
    Never,
    #[default]
    OnRequest,
    OnFailure,
    UnlessTrusted,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum SandboxProfile {
    #[default]
    ReadOnly,
    WorkspaceWrite,
    FullAccess,
    Custom(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PermissionProfile {
    pub name: String,
}

impl Default for PermissionProfile {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
        }
    }
}
