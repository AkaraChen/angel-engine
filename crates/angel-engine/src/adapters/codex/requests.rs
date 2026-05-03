use super::actions::*;
use super::ids::*;
use super::*;

impl CodexAdapter {
    pub(super) fn decode_server_request(
        &self,
        engine: &AngelEngine,
        id: &JsonRpcRequestId,
        method: &str,
        params: &Value,
    ) -> Result<TransportOutput, crate::EngineError> {
        let Some(thread_id) = params.get("threadId").and_then(Value::as_str) else {
            return Ok(TransportOutput::default()
                .message(JsonRpcMessage::error(
                    Some(id.clone()),
                    -32602,
                    format!("{method} request missing threadId"),
                    None,
                ))
                .log(
                    TransportLogKind::Warning,
                    format!("{method} request without thread id"),
                ));
        };
        let Some(conversation_id) = find_codex_conversation(engine, thread_id) else {
            return Ok(TransportOutput::default()
                .message(JsonRpcMessage::error(
                    Some(id.clone()),
                    -32602,
                    format!("{method} request for unknown thread {thread_id}"),
                    None,
                ))
                .log(
                    TransportLogKind::Warning,
                    format!("{method} request for unknown thread {thread_id}"),
                ));
        };
        let kind = match method {
            "item/commandExecution/requestApproval" => ElicitationKind::Approval,
            "item/fileChange/requestApproval" => ElicitationKind::Approval,
            "item/permissions/requestApproval" => ElicitationKind::PermissionProfile,
            "item/tool/requestUserInput" => ElicitationKind::UserInput,
            "mcpServer/elicitation/request" => {
                if params.get("mode").and_then(Value::as_str) == Some("url") {
                    ElicitationKind::ExternalFlow
                } else {
                    ElicitationKind::UserInput
                }
            }
            "item/tool/call" => ElicitationKind::DynamicToolCall,
            _ => {
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
        };
        let mut elicitation = ElicitationState::new(
            ElicitationId::new(format!("codex-request-{id}")),
            RemoteRequestId::JsonRpc(id.clone()),
            kind,
        );
        let mut local_turn_id = None;
        let mut turn_started = None;
        if let Some(turn_id) = params.get("turnId").and_then(Value::as_str) {
            let (turn_id, event) = ensure_local_turn_event(engine, &conversation_id, turn_id);
            elicitation.turn_id = Some(turn_id.clone());
            local_turn_id = Some(turn_id);
            turn_started = event;
        }
        if let Some(item_id) = params.get("itemId").and_then(Value::as_str) {
            let action_id = ActionId::new(item_id.to_string());
            if local_turn_id.is_some() || action_exists(engine, &conversation_id, &action_id) {
                elicitation.action_id = Some(action_id);
            }
        }
        elicitation.options = if method == "item/tool/requestUserInput" {
            user_input_options(method, params)
        } else {
            ElicitationOptions {
                title: Some(method.to_string()),
                body: approval_body(method, params),
                choices: vec![
                    "allow".to_string(),
                    "deny".to_string(),
                    "cancel".to_string(),
                ],
                questions: Vec::new(),
            }
        };

        let mut output = TransportOutput::default().log(
            TransportLogKind::Warning,
            format!(
                "{} requested: {}",
                method,
                elicitation.options.body.clone().unwrap_or_default()
            ),
        );
        if let Some(event) = turn_started {
            output.events.push(event);
        }
        if let Some(action_id) = elicitation.action_id.clone()
            && let Some(turn_id) = elicitation.turn_id.clone()
            && !action_exists(engine, &conversation_id, &action_id)
        {
            output.events.push(EngineEvent::ActionObserved {
                conversation_id: conversation_id.clone(),
                action: fallback_action(action_id, turn_id, action_kind_for_request(method)),
            });
        }
        output.events.push(EngineEvent::ElicitationOpened {
            conversation_id,
            elicitation,
        });
        Ok(output)
    }
}

fn user_input_options(method: &str, params: &Value) -> ElicitationOptions {
    let questions = params
        .get("questions")
        .and_then(Value::as_array)
        .map(|questions| {
            questions
                .iter()
                .filter_map(user_question)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let body = if questions.is_empty() {
        approval_body(method, params)
    } else {
        Some(
            questions
                .iter()
                .map(|question| question.question.as_str())
                .collect::<Vec<_>>()
                .join("\n"),
        )
    };
    ElicitationOptions {
        title: Some(method.to_string()),
        body,
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

fn user_question(value: &Value) -> Option<UserQuestion> {
    let id = value.get("id").and_then(Value::as_str)?;
    let question = value.get("question").and_then(Value::as_str)?;
    Some(UserQuestion {
        id: id.to_string(),
        header: value
            .get("header")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        question: question.to_string(),
        is_secret: value
            .get("isSecret")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        is_other: value
            .get("isOther")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        options: value
            .get("options")
            .and_then(Value::as_array)
            .map(|options| {
                options
                    .iter()
                    .filter_map(|option| {
                        let label = option.get("label").and_then(Value::as_str)?;
                        Some(UserQuestionOption {
                            label: label.to_string(),
                            description: option
                                .get("description")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default(),
        schema: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_input_options_preserve_questions_and_choices() {
        let options = user_input_options(
            "item/tool/requestUserInput",
            &json!({
                "questions": [
                    {
                        "id": "mode",
                        "header": "Plan mode",
                        "question": "Pick a path",
                        "options": [
                            {"label": "allow", "description": "Continue"},
                            {"label": "deny", "description": "Stop"}
                        ]
                    }
                ]
            }),
        );

        assert_eq!(options.title.as_deref(), Some("item/tool/requestUserInput"));
        assert_eq!(options.choices, vec!["allow", "deny"]);
        assert_eq!(options.questions.len(), 1);
        assert_eq!(options.questions[0].id, "mode");
        assert_eq!(options.questions[0].header, "Plan mode");
        assert_eq!(options.questions[0].options[0].description, "Continue");
    }
}
