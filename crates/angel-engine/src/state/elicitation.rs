use crate::ids::{ActionId, ElicitationId, RemoteRequestId, TurnId};

use super::*;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ElicitationState {
    pub id: ElicitationId,
    pub turn_id: Option<TurnId>,
    pub action_id: Option<ActionId>,
    pub remote_request_id: RemoteRequestId,
    pub kind: ElicitationKind,
    pub phase: ElicitationPhase,
    pub options: ElicitationOptions,
}

impl ElicitationState {
    pub fn new(
        id: ElicitationId,
        remote_request_id: RemoteRequestId,
        kind: ElicitationKind,
    ) -> Self {
        Self {
            id,
            turn_id: None,
            action_id: None,
            remote_request_id,
            kind,
            phase: ElicitationPhase::Open,
            options: ElicitationOptions::default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ElicitationKind {
    Approval,
    UserInput,
    ExternalFlow,
    DynamicToolCall,
    PermissionProfile,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ElicitationPhase {
    Open,
    Resolving,
    Resolved { decision: ElicitationDecision },
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ElicitationDecision {
    Allow,
    AllowForSession,
    Deny,
    Cancel,
    Answers(Vec<UserAnswer>),
    DynamicToolResult { success: bool },
    PermissionGrant { scope: ContextScope },
    ExternalComplete,
    Raw(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UserAnswer {
    pub id: String,
    pub value: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ElicitationOptions {
    pub title: Option<String>,
    pub body: Option<String>,
    pub choices: Vec<String>,
    pub questions: Vec<UserQuestion>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UserQuestion {
    pub id: String,
    pub header: String,
    pub question: String,
    pub is_secret: bool,
    pub is_other: bool,
    pub options: Vec<UserQuestionOption>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UserQuestionOption {
    pub label: String,
    pub description: String,
}
