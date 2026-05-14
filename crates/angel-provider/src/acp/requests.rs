use super::helpers::*;
use super::wire::AcpClientRequestMethod;
use super::*;
use agent_client_protocol_schema::{
    PermissionOption as AcpPermissionOption, PermissionOptionKind as AcpPermissionOptionKind,
};
use std::str::FromStr;

impl AcpAdapter {
    pub(super) fn decode_request(
        &self,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        method: &str,
        params: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        match AcpClientRequestMethod::from_str(method) {
            Ok(AcpClientRequestMethod::CreateElicitation) => {
                return self.decode_elicitation_create(engine, id, params);
            }
            Ok(AcpClientRequestMethod::RequestPermission) => {}
            Err(()) => {
                return Ok(TransportOutput::default()
                    .message(JsonRpcMessage::error(
                        Some(id.clone()),
                        -32601,
                        format!("unsupported client request: {method}"),
                        None,
                    ))
                    .log(
                        TransportLogKind::Warning,
                        format!("unsupported request {method}"),
                    ));
            }
        }
        let session_id = params
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or("");
        let Some(conversation_id) = find_acp_conversation(engine, session_id) else {
            return Ok(TransportOutput::default()
                .message(JsonRpcMessage::error(
                    Some(id.clone()),
                    -32602,
                    format!("permission request for unknown session {session_id}"),
                    None,
                ))
                .log(
                    TransportLogKind::Warning,
                    format!("permission request for unknown session {session_id}"),
                ));
        };
        let mut elicitation = ElicitationState::new(
            ElicitationId::new(format!("acp-request-{id}")),
            RemoteRequestId::JsonRpc(id.clone()),
            ElicitationKind::Approval,
        );
        let active_turn_id = active_turn_id(engine, &conversation_id);
        if let Some(turn_id) = active_turn_id.clone() {
            elicitation.turn_id = Some(turn_id);
        }
        let tool_call = params.get("toolCall");
        let tool_call_id = params
            .get("toolCallId")
            .or_else(|| tool_call.and_then(|tool_call| tool_call.get("toolCallId")))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|id| !id.is_empty());
        if let (Some(tool_call), Some(tool_call_id)) = (tool_call, tool_call_id) {
            let action_id = ActionId::new(tool_call_id.to_string());
            if let Some(existing_action_id) =
                matching_acp_tool_action_id(engine, &conversation_id, tool_call, &action_id)
            {
                self.remember_duplicate_tool_action(tool_call_id, existing_action_id.clone());
                return Ok(TransportOutput::default()
                    .message(JsonRpcMessage::response(
                        id.clone(),
                        super::wire::cancelled_permission_response_json(),
                    ))
                    .log(
                        TransportLogKind::Warning,
                        format!(
                            "cancelled duplicate ACP permission request for {tool_call_id}; active action {existing_action_id} already represents it"
                        ),
                    ));
            }
        }
        if let Some(tool_call_id) = tool_call_id {
            let action_id = ActionId::new(tool_call_id.to_string());
            if active_turn_id.is_some() || acp_action_exists(engine, &conversation_id, &action_id) {
                elicitation.action_id = Some(action_id);
            }
        }
        let permission_choices = permission_choices(params);
        elicitation.options = ElicitationOptions {
            title: params
                .get("title")
                .or_else(|| tool_call.and_then(|tool_call| tool_call.get("title")))
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| Some("permission requested".to_string())),
            body: params
                .get("description")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| tool_call.and_then(tool_call_summary)),
            choices: permission_choices
                .iter()
                .map(|choice| choice.label.clone())
                .collect(),
            choice_details: permission_choices,
            questions: Vec::new(),
        };
        let mut output =
            TransportOutput::default().log(TransportLogKind::Warning, "ACP permission requested");
        if let Some(action_id) = elicitation.action_id.clone()
            && let Some(turn_id) = elicitation.turn_id.clone()
            && !acp_action_exists(engine, &conversation_id, &action_id)
        {
            let mut action = ActionState::new(action_id.clone(), turn_id, ActionKind::McpTool);
            action.title = elicitation.options.title.clone();
            action.input = ActionInput {
                summary: elicitation.options.body.clone(),
                raw: Some(params.to_string()),
            };
            output.events.push(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action,
            });
        }
        output.events.push(EngineEvent::ElicitationOpened {
            conversation_id,
            elicitation,
        });
        Ok(output)
    }

    fn decode_elicitation_create(
        &self,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        params: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let session_id = params.get("sessionId").and_then(Value::as_str);
        let Some(conversation_id) = session_id
            .and_then(|session_id| find_acp_conversation(engine, session_id))
            .or_else(|| engine.selected.clone())
        else {
            return Ok(TransportOutput::default()
                .message(JsonRpcMessage::error(
                    Some(id.clone()),
                    -32602,
                    "elicitation request without a known session".to_string(),
                    None,
                ))
                .log(
                    TransportLogKind::Warning,
                    "elicitation request without a known session",
                ));
        };

        let mode = params.get("mode").and_then(Value::as_str).unwrap_or("form");
        let kind = if mode == "url" {
            ElicitationKind::ExternalFlow
        } else {
            ElicitationKind::UserInput
        };
        let mut elicitation = ElicitationState::new(
            ElicitationId::new(
                params
                    .get("elicitationId")
                    .and_then(Value::as_str)
                    .map(|id| format!("acp-elicitation-{id}"))
                    .unwrap_or_else(|| format!("acp-elicitation-{id}")),
            ),
            RemoteRequestId::JsonRpc(id.clone()),
            kind,
        );
        let active_turn_id = active_turn_id(engine, &conversation_id);
        if let Some(turn_id) = active_turn_id.clone() {
            elicitation.turn_id = Some(turn_id);
        }
        if let Some(tool_call_id) = params.get("toolCallId").and_then(Value::as_str) {
            let action_id = ActionId::new(tool_call_id.to_string());
            if active_turn_id.is_some() || acp_action_exists(engine, &conversation_id, &action_id) {
                elicitation.action_id = Some(action_id);
            }
        }

        let message = params
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("input requested");
        elicitation.options = if mode == "url" {
            ElicitationOptions {
                title: Some(message.to_string()),
                body: params
                    .get("url")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                choices: vec!["allow".to_string(), "cancel".to_string()],
                choice_details: Vec::new(),
                questions: Vec::new(),
            }
        } else {
            acp_elicitation_form_options(message, params)
        };

        let mut output =
            TransportOutput::default().log(TransportLogKind::Warning, "ACP elicitation requested");
        if let Some(action_id) = elicitation.action_id.clone()
            && let Some(turn_id) = elicitation.turn_id.clone()
            && !acp_action_exists(engine, &conversation_id, &action_id)
        {
            let mut action = ActionState::new(action_id.clone(), turn_id, ActionKind::McpTool);
            action.title = elicitation.options.title.clone();
            action.input = ActionInput {
                summary: elicitation.options.body.clone(),
                raw: Some(params.to_string()),
            };
            output.events.push(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action,
            });
        }
        output.events.push(EngineEvent::ElicitationOpened {
            conversation_id,
            elicitation,
        });
        Ok(output)
    }
}

fn acp_elicitation_form_options(message: &str, params: &Value) -> ElicitationOptions {
    let required = params
        .get("requestedSchema")
        .and_then(|schema| schema.get("required"))
        .and_then(Value::as_array)
        .map(|required| {
            required
                .iter()
                .filter_map(Value::as_str)
                .collect::<std::collections::BTreeSet<_>>()
        })
        .unwrap_or_default();
    let questions = params
        .get("requestedSchema")
        .and_then(|schema| schema.get("properties"))
        .and_then(Value::as_object)
        .map(|properties| {
            properties
                .iter()
                .map(|(id, schema)| {
                    acp_elicitation_question(id, message, schema, required.contains(id.as_str()))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    ElicitationOptions {
        title: Some(message.to_string()),
        body: Some(message.to_string()),
        choices: if questions.len() == 1 {
            questions[0]
                .options
                .iter()
                .map(|option| option.label.clone())
                .collect()
        } else {
            Vec::new()
        },
        choice_details: Vec::new(),
        questions,
    }
}

fn acp_elicitation_question(
    id: &str,
    message: &str,
    schema: &Value,
    required: bool,
) -> UserQuestion {
    let header = schema
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(id)
        .to_string();
    let question = schema
        .get("description")
        .or_else(|| schema.get("title"))
        .and_then(Value::as_str)
        .unwrap_or(message)
        .to_string();
    UserQuestion {
        id: id.to_string(),
        header,
        question,
        is_secret: schema
            .get("format")
            .and_then(Value::as_str)
            .is_some_and(|format| format == "password"),
        is_other: false,
        options: acp_elicitation_question_options(schema),
        schema: Some(acp_elicitation_question_schema(schema, required)),
    }
}

fn acp_elicitation_question_options(schema: &Value) -> Vec<UserQuestionOption> {
    let option_schema = if schema.get("type").and_then(Value::as_str) == Some("array") {
        schema.get("items").unwrap_or(schema)
    } else {
        schema
    };
    if let Some(values) = option_schema.get("enum").and_then(Value::as_array) {
        return values
            .iter()
            .map(|value| UserQuestionOption {
                label: json_label(value),
                description: String::new(),
            })
            .collect();
    }
    if let Some(options) = option_schema.get("oneOf").and_then(Value::as_array) {
        return options
            .iter()
            .filter_map(|option| {
                let label = option.get("title").and_then(Value::as_str).map_or_else(
                    || option.get("const").map(json_label),
                    |title| Some(title.to_string()),
                )?;
                Some(UserQuestionOption {
                    label,
                    description: option
                        .get("description")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                })
            })
            .collect();
    }
    if option_schema.get("type").and_then(Value::as_str) == Some("boolean") {
        return vec![
            UserQuestionOption {
                label: "true".to_string(),
                description: String::new(),
            },
            UserQuestionOption {
                label: "false".to_string(),
                description: String::new(),
            },
        ];
    }
    Vec::new()
}

fn acp_elicitation_question_schema(
    schema: &Value,
    required: bool,
) -> angel_engine::UserQuestionSchema {
    let value_type = question_value_type(schema);
    let item_value_type = schema.get("items").map(question_value_type);
    angel_engine::UserQuestionSchema {
        multiple: matches!(value_type, angel_engine::QuestionValueType::Array),
        value_type,
        item_value_type,
        required,
        format: schema
            .get("format")
            .and_then(Value::as_str)
            .map(str::to_string),
        default_value: schema.get("default").map(json_label),
        constraints: angel_engine::QuestionConstraints {
            pattern: string_constraint(schema, "pattern"),
            minimum: scalar_constraint(schema, "minimum"),
            maximum: scalar_constraint(schema, "maximum"),
            min_length: scalar_constraint(schema, "minLength"),
            max_length: scalar_constraint(schema, "maxLength"),
            min_items: scalar_constraint(schema, "minItems"),
            max_items: scalar_constraint(schema, "maxItems"),
            unique_items: schema.get("uniqueItems").and_then(Value::as_bool),
        },
        raw_schema: Some(json_string(schema)),
    }
}

fn question_value_type(schema: &Value) -> angel_engine::QuestionValueType {
    match schema
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
    {
        "string" => angel_engine::QuestionValueType::String,
        "number" => angel_engine::QuestionValueType::Number,
        "integer" => angel_engine::QuestionValueType::Integer,
        "boolean" => angel_engine::QuestionValueType::Boolean,
        "array" => angel_engine::QuestionValueType::Array,
        "object" => angel_engine::QuestionValueType::Object,
        other => angel_engine::QuestionValueType::Unknown(other.to_string()),
    }
}

fn string_constraint(schema: &Value, key: &str) -> Option<String> {
    schema.get(key).and_then(Value::as_str).map(str::to_string)
}

fn scalar_constraint(schema: &Value, key: &str) -> Option<String> {
    schema.get(key).map(json_label)
}

fn json_label(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn json_string(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}

fn permission_choices(params: &Value) -> Vec<ElicitationChoice> {
    let choices = params
        .get("options")
        .and_then(Value::as_array)
        .map(|options| {
            options
                .iter()
                .filter_map(|option| {
                    let option =
                        serde_json::from_value::<AcpPermissionOption>(option.clone()).ok()?;
                    Some(ElicitationChoice {
                        id: option.option_id.to_string(),
                        label: option.name,
                        kind: permission_choice_kind(option.kind),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if choices.is_empty() {
        vec![
            ElicitationChoice {
                id: "allow".to_string(),
                label: "allow".to_string(),
                kind: Some(ElicitationChoiceKind::AllowOnce),
            },
            ElicitationChoice {
                id: "deny".to_string(),
                label: "deny".to_string(),
                kind: Some(ElicitationChoiceKind::RejectOnce),
            },
            ElicitationChoice {
                id: "cancel".to_string(),
                label: "cancel".to_string(),
                kind: None,
            },
        ]
    } else {
        choices
    }
}

fn permission_choice_kind(kind: AcpPermissionOptionKind) -> Option<ElicitationChoiceKind> {
    match kind {
        AcpPermissionOptionKind::AllowOnce => Some(ElicitationChoiceKind::AllowOnce),
        AcpPermissionOptionKind::AllowAlways => Some(ElicitationChoiceKind::AllowAlways),
        AcpPermissionOptionKind::RejectOnce => Some(ElicitationChoiceKind::RejectOnce),
        AcpPermissionOptionKind::RejectAlways => Some(ElicitationChoiceKind::RejectAlways),
        _ => None,
    }
}

fn tool_call_summary(tool_call: &Value) -> Option<String> {
    tool_call.get("content").and_then(content_text).or_else(|| {
        tool_call
            .get("title")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

fn content_text(value: &Value) -> Option<String> {
    if let Some(text) = value.get("text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    if let Some(array) = value.as_array() {
        let parts = array
            .iter()
            .filter_map(|item| {
                item.get("content")
                    .and_then(content_text)
                    .or_else(|| item.get("text").and_then(Value::as_str).map(str::to_string))
            })
            .collect::<Vec<_>>();
        if !parts.is_empty() {
            return Some(parts.join(""));
        }
    }
    None
}
