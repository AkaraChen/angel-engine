use std::str::FromStr;

use agent_client_protocol_schema as acp_schema;
use serde::{Deserialize, Serialize};

pub(crate) use acp_schema::AGENT_METHOD_NAMES;
pub(crate) use acp_schema::CLIENT_METHOD_NAMES;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AcpClientRequestMethod {
    RequestPermission,
    CreateElicitation,
}

impl FromStr for AcpClientRequestMethod {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            value if value == CLIENT_METHOD_NAMES.session_request_permission => {
                Ok(Self::RequestPermission)
            }
            value if value == CLIENT_METHOD_NAMES.elicitation_create => Ok(Self::CreateElicitation),
            _ => Err(()),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AcpNotificationMethod {
    SessionUpdate,
    ElicitationComplete,
    CancelRequest,
}

impl FromStr for AcpNotificationMethod {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            value if value == CLIENT_METHOD_NAMES.session_update => Ok(Self::SessionUpdate),
            value if value == CLIENT_METHOD_NAMES.elicitation_complete => {
                Ok(Self::ElicitationComplete)
            }
            value if value == acp_schema::PROTOCOL_LEVEL_METHOD_NAMES.cancel_request => {
                Ok(Self::CancelRequest)
            }
            _ => Err(()),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AcpSessionUpdateKind {
    UserMessageChunk,
    AgentMessageChunk,
    AgentThoughtChunk,
    ToolCall,
    ToolCallUpdate,
    Plan,
    AvailableCommandsUpdate,
    CurrentModeUpdate,
    ConfigOptionUpdate,
    SessionInfoUpdate,
    UsageUpdate,
}

impl AcpSessionUpdateKind {
    pub(crate) fn wire_string(self) -> String {
        match serde_json::to_value(self).expect("serialize ACP session update kind") {
            serde_json::Value::String(value) => value,
            _ => unreachable!("ACP session update kind serializes as a string"),
        }
    }

    pub(crate) fn wire_value(self) -> serde_json::Value {
        serde_json::to_value(self).expect("serialize ACP session update kind")
    }
}

impl FromStr for AcpSessionUpdateKind {
    type Err = serde_json::Error;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        serde_json::from_value(serde_json::Value::String(value.to_string()))
    }
}

pub(crate) fn parse_stop_reason(value: &str) -> Option<acp_schema::StopReason> {
    serde_json::from_value(serde_json::Value::String(value.to_string())).ok()
}

pub(crate) fn parse_tool_status(value: &str) -> Option<acp_schema::ToolCallStatus> {
    serde_json::from_value(serde_json::Value::String(value.to_string())).ok()
}

pub(crate) fn parse_tool_kind(value: &str) -> Option<acp_schema::ToolKind> {
    serde_json::from_value(serde_json::Value::String(value.to_string())).ok()
}

pub(crate) fn permission_response_json(option_id: Option<&str>) -> serde_json::Value {
    let response = match option_id {
        Some(option_id) => acp_schema::RequestPermissionResponse::new(
            acp_schema::RequestPermissionOutcome::Selected(
                acp_schema::SelectedPermissionOutcome::new(option_id.to_string()),
            ),
        ),
        None => acp_schema::RequestPermissionResponse::new(
            acp_schema::RequestPermissionOutcome::Cancelled,
        ),
    };
    serde_json::to_value(response).expect("serialize ACP permission response")
}

pub(crate) fn cancelled_permission_response_json() -> serde_json::Value {
    permission_response_json(None)
}
