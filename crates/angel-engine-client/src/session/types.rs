use garde::Validate;
use serde::{Deserialize, Serialize};

use crate::{ActionOutputSnapshot, ClientInput, ConversationSnapshot, DisplayMessagePartSnapshot};

fn validate_trimmed_not_empty(value: &str, _: &()) -> garde::Result {
    if value.trim().is_empty() {
        return Err(garde::Error::new("text must not be empty"));
    }
    Ok(())
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SendTextRequest {
    #[garde(custom(validate_trimmed_not_empty))]
    pub text: String,
    #[serde(default)]
    #[garde(skip)]
    pub input: Vec<ClientInput>,
    #[serde(default)]
    #[garde(skip)]
    pub cwd: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub remote_id: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub model: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub mode: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub permission_mode: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub reasoning_effort: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SetModeRequest {
    #[garde(length(min = 1))]
    pub mode: String,
    #[serde(default)]
    #[garde(skip)]
    pub cwd: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub remote_id: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SetPermissionModeRequest {
    #[garde(length(min = 1))]
    pub mode: String,
    #[serde(default)]
    #[garde(skip)]
    pub cwd: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub remote_id: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydrateRequest {
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub remote_id: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectRequest {
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshSkillsRequest {
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub remote_id: Option<String>,
    #[serde(default)]
    pub force_reload: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnRunResult {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation: Option<ConversationSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[allow(clippy::large_enum_variant)]
pub enum TurnRunEvent {
    Delta {
        part: TurnRunDeltaPart,
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        turn_id: Option<String>,
        message_part: DisplayMessagePartSnapshot,
    },
    ActionObserved {
        message_part: DisplayMessagePartSnapshot,
    },
    ActionUpdated {
        message_part: DisplayMessagePartSnapshot,
    },
    ActionOutputDelta {
        turn_id: String,
        action_id: String,
        content: ActionOutputSnapshot,
        message_part: DisplayMessagePartSnapshot,
    },
    Elicitation {
        message_part: DisplayMessagePartSnapshot,
    },
    PlanUpdated {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        turn_id: Option<String>,
        message_part: DisplayMessagePartSnapshot,
    },
    Result {
        result: TurnRunResult,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TurnRunDeltaPart {
    Reasoning,
    Text,
}
