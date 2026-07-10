use super::super::*;

pub(super) fn permission_response(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<TransportOutput, angel_engine::EngineError> {
    let conversation_id = effect.conversation_id.clone().ok_or_else(|| {
        angel_engine::EngineError::InvalidCommand {
            message: "missing conversation id for permission response".to_string(),
        }
    })?;
    let elicitation_id = ElicitationId::new(
        effect
            .payload
            .fields
            .get("elicitationId")
            .cloned()
            .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                message: "missing elicitation id".to_string(),
            })?,
    );
    let conversation = engine.conversations.get(&conversation_id).ok_or_else(|| {
        angel_engine::EngineError::ConversationNotFound {
            conversation_id: conversation_id.to_string(),
        }
    })?;
    let elicitation = conversation
        .elicitations
        .get(&elicitation_id)
        .ok_or_else(|| angel_engine::EngineError::ElicitationNotFound {
            elicitation_id: elicitation_id.to_string(),
        })?;
    let remote_request_id = match &elicitation.remote_request_id {
        RemoteRequestId::JsonRpc(id) => id.clone(),
        other => {
            return Err(angel_engine::EngineError::InvalidState {
                expected: "ACP permission request id".to_string(),
                actual: format!("{other:?}"),
            });
        }
    };
    let decision = effect
        .payload
        .fields
        .get("decision")
        .map(String::as_str)
        .unwrap_or("Cancel");
    if matches!(
        elicitation.kind,
        angel_engine::ElicitationKind::UserInput | angel_engine::ElicitationKind::ExternalFlow
    ) {
        let result = acp_elicitation_response(decision, &effect.payload.fields);
        let mut output = TransportOutput::default()
            .message(JsonRpcMessage::response(remote_request_id, result))
            .event(EngineEvent::ElicitationResolved {
                conversation_id,
                elicitation_id,
                decision: angel_engine::ElicitationDecision::Raw(decision.to_string()),
            })
            .log(TransportLogKind::Send, "answered ACP elicitation request");
        if let Some(request_id) = &effect.request_id {
            output.completed_requests.push(request_id.clone());
        }
        return Ok(output);
    }
    let selected_option = select_permission_option(&elicitation.options, decision);
    let result = super::super::wire::permission_response_json(selected_option.as_deref());
    let mut output = TransportOutput::default()
        .message(JsonRpcMessage::response(remote_request_id, result))
        .event(EngineEvent::ElicitationResolved {
            conversation_id,
            elicitation_id,
            decision: angel_engine::ElicitationDecision::Raw(decision.to_string()),
        })
        .log(TransportLogKind::Send, "answered ACP permission request");
    if let Some(request_id) = &effect.request_id {
        output.completed_requests.push(request_id.clone());
    }
    Ok(output)
}

fn acp_elicitation_response(
    decision: &str,
    fields: &std::collections::BTreeMap<String, String>,
) -> Value {
    match decision {
        "Deny" => json!({"action": "decline"}),
        "Cancel" => json!({"action": "cancel"}),
        _ => json!({
            "action": "accept",
            "content": acp_elicitation_answer_content(fields),
        }),
    }
}

fn acp_elicitation_answer_content(fields: &std::collections::BTreeMap<String, String>) -> Value {
    let answer_count = fields
        .get("answerCount")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let mut grouped: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for index in 0..answer_count {
        let Some(id) = fields.get(&format!("answer.{index}.id")) else {
            continue;
        };
        grouped.entry(id.clone()).or_default().push(
            fields
                .get(&format!("answer.{index}.value"))
                .cloned()
                .unwrap_or_default(),
        );
    }
    Value::Object(
        grouped
            .into_iter()
            .map(|(id, values)| {
                let value = if values.len() == 1 {
                    json!(values[0])
                } else {
                    json!(values)
                };
                (id, value)
            })
            .collect(),
    )
}

pub(super) fn select_permission_option(
    options: &ElicitationOptions,
    decision: &str,
) -> Option<String> {
    match decision {
        "AllowForSession" => permission_option_with_kind(
            options,
            &[
                ElicitationChoiceKind::AllowAlways,
                ElicitationChoiceKind::AllowOnce,
            ],
        )
        .or_else(|| legacy_permission_option(options, &["allow_always", "allow"])),
        "Allow" => permission_option_with_kind(
            options,
            &[
                ElicitationChoiceKind::AllowOnce,
                ElicitationChoiceKind::AllowAlways,
            ],
        )
        .or_else(|| legacy_permission_option(options, &["allow"])),
        "Deny" => permission_option_with_kind(
            options,
            &[
                ElicitationChoiceKind::RejectOnce,
                ElicitationChoiceKind::RejectAlways,
            ],
        )
        .or_else(|| legacy_permission_option(options, &["deny", "reject"])),
        _ => None,
    }
}

fn permission_option_with_kind(
    options: &ElicitationOptions,
    kinds: &[ElicitationChoiceKind],
) -> Option<String> {
    kinds.iter().find_map(|kind| {
        options
            .choice_details
            .iter()
            .find(|choice| choice.kind.as_ref() == Some(kind))
            .map(|choice| choice.id.clone())
    })
}

fn legacy_permission_option(options: &ElicitationOptions, ids: &[&str]) -> Option<String> {
    options
        .choice_details
        .iter()
        .map(|choice| choice.id.as_str())
        .chain(options.choices.iter().map(String::as_str))
        .find(|choice| ids.iter().any(|id| choice.eq_ignore_ascii_case(id)))
        .map(str::to_string)
}
