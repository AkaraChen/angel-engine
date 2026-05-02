use crate::error::EngineError;
use crate::state::ActionPhase;

use super::InvalidEventPolicy;

pub(super) enum DeltaKind {
    Assistant,
    Reasoning,
    Plan,
}

pub(super) fn is_terminal_action_phase(phase: &ActionPhase) -> bool {
    matches!(
        phase,
        ActionPhase::Completed
            | ActionPhase::Failed
            | ActionPhase::Declined
            | ActionPhase::Cancelled
    )
}

pub(super) fn handle_stale_with_policy<T>(
    invalid_event_policy: InvalidEventPolicy,
    message: String,
) -> Result<T, EngineError>
where
    T: Default,
{
    match invalid_event_policy {
        InvalidEventPolicy::StrictError | InvalidEventPolicy::RecordFault => {
            Err(EngineError::StaleEvent { message })
        }
        InvalidEventPolicy::IgnoreStale => Ok(T::default()),
    }
}
