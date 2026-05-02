use super::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AcpStopReason {
    EndTurn,
    MaxTokens,
    MaxTurnRequests,
    Refusal,
    Cancelled,
}

impl From<AcpStopReason> for TurnOutcome {
    fn from(value: AcpStopReason) -> Self {
        match value {
            AcpStopReason::EndTurn => Self::Succeeded,
            AcpStopReason::MaxTokens => Self::Exhausted {
                reason: ExhaustionReason::MaxTokens,
            },
            AcpStopReason::MaxTurnRequests => Self::Exhausted {
                reason: ExhaustionReason::MaxTurnRequests,
            },
            AcpStopReason::Refusal => Self::Refused,
            AcpStopReason::Cancelled => Self::Interrupted,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AcpToolStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}
