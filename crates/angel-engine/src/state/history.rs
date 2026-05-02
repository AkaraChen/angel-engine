#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HistoryState {
    pub hydrated: bool,
    pub turn_count: usize,
    pub workspace_reverted: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HistoryMutationOp {
    Compact,
    Rollback { num_turns: usize },
    InjectItems { count: usize },
    ReplaceHistory,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HistoryMutationResult {
    pub success: bool,
    pub workspace_reverted: bool,
    pub message: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObserverState {
    pub subscribed: bool,
    pub visible: bool,
}

impl Default for ObserverState {
    fn default() -> Self {
        Self {
            subscribed: true,
            visible: true,
        }
    }
}
