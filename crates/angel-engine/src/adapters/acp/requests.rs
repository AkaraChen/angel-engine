use super::helpers::*;
use super::*;

impl AcpAdapter {
    pub(super) fn decode_request(
        &self,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        method: &str,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        if method == "elicitation/create" {
            return self.decode_elicitation_create(engine, id, params);
        }
        if method != "session/request_permission" {
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
            RemoteRequestId::Acp(id.clone()),
            ElicitationKind::Approval,
        );
        let active_turn_id = active_turn_id(engine, &conversation_id);
        if let Some(turn_id) = active_turn_id.clone() {
            elicitation.turn_id = Some(turn_id);
        }
        let tool_call = params.get("toolCall");
        if let Some(tool_call_id) = params
            .get("toolCallId")
            .or_else(|| tool_call.and_then(|tool_call| tool_call.get("toolCallId")))
            .and_then(Value::as_str)
        {
            let action_id = ActionId::new(tool_call_id.to_string());
            if active_turn_id.is_some() || acp_action_exists(engine, &conversation_id, &action_id) {
                elicitation.action_id = Some(action_id);
            }
        }
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
            choices: permission_option_ids(params),
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
    ) -> Result<TransportOutput, crate::EngineError> {
        let session_id = params
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or("");
        let Some(conversation_id) = find_acp_conversation(engine, session_id) else {
            return Ok(TransportOutput::default()
                .message(JsonRpcMessage::error(
                    Some(id.clone()),
                    -32602,
                    format!("elicitation request for unknown session {session_id}"),
                    None,
                ))
                .log(
                    TransportLogKind::Warning,
                    format!("elicitation request for unknown session {session_id}"),
                ));
        };

        let mode = params.get("mode").and_then(Value::as_str).unwrap_or("form");
        let kind = if mode == "url" {
            ElicitationKind::ExternalFlow
        } else {
            ElicitationKind::UserInput
        };
        let mut elicitation = ElicitationState::new(
            ElicitationId::new(format!("acp-elicitation-{id}")),
            RemoteRequestId::Acp(id.clone()),
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
    let questions = params
        .get("requestedSchema")
        .and_then(|schema| schema.get("properties"))
        .and_then(Value::as_object)
        .map(|properties| {
            properties
                .iter()
                .map(|(id, schema)| acp_elicitation_question(id, message, schema))
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
        questions,
    }
}

fn acp_elicitation_question(id: &str, message: &str, schema: &Value) -> UserQuestion {
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
    }
}

fn acp_elicitation_question_options(schema: &Value) -> Vec<UserQuestionOption> {
    if let Some(values) = schema.get("enum").and_then(Value::as_array) {
        return values
            .iter()
            .filter_map(Value::as_str)
            .map(|label| UserQuestionOption {
                label: label.to_string(),
                description: String::new(),
            })
            .collect();
    }
    if let Some(options) = schema.get("oneOf").and_then(Value::as_array) {
        return options
            .iter()
            .filter_map(|option| {
                let label = option
                    .get("title")
                    .or_else(|| option.get("const"))
                    .and_then(Value::as_str)?;
                Some(UserQuestionOption {
                    label: label.to_string(),
                    description: option
                        .get("description")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                })
            })
            .collect();
    }
    if schema.get("type").and_then(Value::as_str) == Some("boolean") {
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

fn permission_option_ids(params: &Value) -> Vec<String> {
    let choices = params
        .get("options")
        .and_then(Value::as_array)
        .map(|options| {
            options
                .iter()
                .filter_map(|option| option.get("optionId").and_then(Value::as_str))
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if choices.is_empty() {
        vec![
            "allow".to_string(),
            "deny".to_string(),
            "cancel".to_string(),
        ]
    } else {
        choices
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
