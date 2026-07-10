use angel_engine::{ElicitationDecision, UserAnswer, UserInput, UserInputKind};
use serde::{Deserialize, Serialize};

use crate::error::{ClientError, ClientResult};
use crate::event::ClientUpdate;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientCommandResult {
    pub conversation_id: Option<String>,
    pub turn_id: Option<String>,
    pub request_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub update: ClientUpdate,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryRequest {
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub additional_directories: Vec<String>,
    #[serde(default)]
    pub cursor: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeConversationRequest {
    pub remote_id: String,
    #[serde(default)]
    pub hydrate: bool,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub additional_directories: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkConversationRequest {
    pub source_conversation_id: String,
    #[serde(default)]
    pub at_turn_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ClientInput {
    Text {
        text: String,
    },
    Image {
        data: String,
        mime_type: String,
        #[serde(default)]
        name: Option<String>,
    },
    ResourceLink {
        name: String,
        uri: String,
        #[serde(default)]
        mime_type: Option<String>,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        description: Option<String>,
    },
    FileMention {
        name: String,
        path: String,
        #[serde(default)]
        mime_type: Option<String>,
    },
    SkillMention {
        name: String,
        path: String,
    },
    EmbeddedTextResource {
        uri: String,
        text: String,
        #[serde(default)]
        mime_type: Option<String>,
    },
    EmbeddedBlobResource {
        uri: String,
        data: String,
        #[serde(default)]
        mime_type: Option<String>,
        #[serde(default)]
        name: Option<String>,
    },
    RawContentBlock {
        value: serde_json::Value,
    },
}

impl ClientInput {
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text { text: text.into() }
    }

    pub fn resource_link(name: impl Into<String>, uri: impl Into<String>) -> Self {
        Self::ResourceLink {
            name: name.into(),
            uri: uri.into(),
            mime_type: None,
            title: None,
            description: None,
        }
    }

    pub fn file_mention(
        name: impl Into<String>,
        path: impl Into<String>,
        mime_type: Option<String>,
    ) -> Self {
        Self::FileMention {
            name: name.into(),
            path: path.into(),
            mime_type,
        }
    }

    pub fn skill_mention(name: impl Into<String>, path: impl Into<String>) -> Self {
        Self::SkillMention {
            name: name.into(),
            path: path.into(),
        }
    }

    pub fn embedded_text_resource(uri: impl Into<String>, text: impl Into<String>) -> Self {
        Self::EmbeddedTextResource {
            uri: uri.into(),
            text: text.into(),
            mime_type: None,
        }
    }

    pub fn embedded_blob_resource(
        uri: impl Into<String>,
        data: impl Into<String>,
        mime_type: Option<String>,
        name: Option<String>,
    ) -> Self {
        Self::EmbeddedBlobResource {
            uri: uri.into(),
            data: data.into(),
            mime_type,
            name,
        }
    }

    pub fn image(
        data: impl Into<String>,
        mime_type: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        Self::Image {
            data: data.into(),
            mime_type: mime_type.into(),
            name,
        }
    }

    pub fn raw_content_block(value: serde_json::Value) -> Self {
        Self::RawContentBlock { value }
    }
}

fn require_input_name(name: Option<String>, kind: &str) -> ClientResult<String> {
    name.filter(|value| !value.trim().is_empty())
        .ok_or_else(|| ClientError::InvalidInput {
            message: format!("{kind} input requires a non-empty name"),
        })
}

impl TryFrom<ClientInput> for UserInput {
    type Error = ClientError;

    fn try_from(input: ClientInput) -> Result<Self, Self::Error> {
        Ok(match input {
            ClientInput::Text { text } => UserInput::text(text),
            ClientInput::Image {
                data,
                mime_type,
                name,
            } => {
                let name = require_input_name(name, "image")?;
                UserInput::image(data, mime_type, Some(name))
            }
            ClientInput::ResourceLink {
                name,
                uri,
                mime_type,
                title,
                description,
            } => UserInput {
                content: uri.clone(),
                kind: UserInputKind::ResourceLink {
                    name,
                    uri,
                    mime_type,
                    title,
                    description,
                },
            },
            ClientInput::FileMention {
                name,
                path,
                mime_type,
            } => UserInput::file_mention(name, path, mime_type),
            ClientInput::SkillMention { name, path } => UserInput::skill_mention(name, path),
            ClientInput::EmbeddedTextResource {
                uri,
                text,
                mime_type,
            } => UserInput::embedded_text_resource(uri, text, mime_type),
            ClientInput::EmbeddedBlobResource {
                uri,
                data,
                mime_type,
                name,
            } => {
                let name = require_input_name(name, "embedded blob resource")?;
                UserInput::embedded_blob_resource(uri, data, mime_type, Some(name))
            }
            ClientInput::RawContentBlock { value } => UserInput::raw_content_block(value),
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ElicitationResponse {
    Allow,
    AllowForSession,
    Deny,
    Cancel,
    Answers { answers: Vec<ClientAnswer> },
    DynamicToolResult { success: bool },
    ExternalComplete,
    Raw { value: String },
}

impl ElicitationResponse {
    pub fn answers(answers: impl IntoIterator<Item = ClientAnswer>) -> Self {
        Self::Answers {
            answers: answers.into_iter().collect(),
        }
    }

    pub fn raw(value: impl Into<String>) -> Self {
        Self::Raw {
            value: value.into(),
        }
    }
}

impl From<ElicitationResponse> for ElicitationDecision {
    fn from(response: ElicitationResponse) -> Self {
        match response {
            ElicitationResponse::Allow => Self::Allow,
            ElicitationResponse::AllowForSession => Self::AllowForSession,
            ElicitationResponse::Deny => Self::Deny,
            ElicitationResponse::Cancel => Self::Cancel,
            ElicitationResponse::Answers { answers } => Self::Answers(
                answers
                    .into_iter()
                    .map(|answer| UserAnswer {
                        id: answer.id,
                        value: answer.value,
                    })
                    .collect(),
            ),
            ElicitationResponse::DynamicToolResult { success } => {
                Self::DynamicToolResult { success }
            }
            ElicitationResponse::ExternalComplete => Self::ExternalComplete,
            ElicitationResponse::Raw { value } => Self::Raw(value),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAnswer {
    pub id: String,
    pub value: String,
}
