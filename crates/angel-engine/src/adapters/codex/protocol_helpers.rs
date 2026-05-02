use super::*;

pub(crate) enum DeltaKind {
    Assistant,
    Reasoning,
}

pub(crate) fn text_input(text: String) -> Value {
    json!([
        {
            "type": "text",
            "text": text,
            "text_elements": [],
        }
    ])
}

pub(crate) fn codex_context_patch(result: &Value) -> ContextPatch {
    let mut patch = ContextPatch::empty();
    if let Some(model) = result.get("model").and_then(Value::as_str) {
        patch.updates.push(crate::ContextUpdate::Model {
            scope: crate::ContextScope::Conversation,
            model: Some(model.to_string()),
        });
    }
    if let Some(cwd) = result.get("cwd").and_then(Value::as_str) {
        patch.updates.push(crate::ContextUpdate::Cwd {
            scope: crate::ContextScope::Conversation,
            cwd: Some(cwd.to_string()),
        });
    }
    patch
}

pub(crate) fn codex_elicitation_response(
    elicitation: &ElicitationState,
    fields: &std::collections::BTreeMap<String, String>,
) -> Value {
    let decision = fields
        .get("decision")
        .map(String::as_str)
        .unwrap_or("Cancel");
    match &elicitation.kind {
        ElicitationKind::Approval => json!({
            "decision": match decision {
                "AllowForSession" => "acceptForSession",
                "Deny" => "decline",
                "Cancel" => "cancel",
                _ => "accept",
            }
        }),
        ElicitationKind::PermissionProfile => json!({
            "permissions": {},
            "scope": "turn",
        }),
        ElicitationKind::UserInput => {
            if elicitation.options.title.as_deref() == Some("mcpServer/elicitation/request") {
                mcp_elicitation_response(decision, fields)
            } else {
                json!({
                    "answers": tool_user_input_answers(fields),
                })
            }
        }
        ElicitationKind::ExternalFlow => json!({
            "action": if decision == "Cancel" { "cancel" } else { "accept" },
            "content": null,
            "_meta": null,
        }),
        ElicitationKind::DynamicToolCall => json!({
            "contentItems": [{"type": "inputText", "text": ""}],
            "success": !matches!(decision, "Deny" | "Cancel"),
        }),
    }
}

fn tool_user_input_answers(fields: &std::collections::BTreeMap<String, String>) -> Value {
    let answer_count = fields
        .get("answerCount")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let mut grouped = serde_json::Map::new();
    for index in 0..answer_count {
        let Some(id) = fields.get(&format!("answer.{index}.id")) else {
            continue;
        };
        let value = fields
            .get(&format!("answer.{index}.value"))
            .cloned()
            .unwrap_or_default();
        let entry = grouped
            .entry(id.clone())
            .or_insert_with(|| json!({ "answers": [] }));
        if let Some(answers) = entry.get_mut("answers").and_then(Value::as_array_mut) {
            answers.push(json!(value));
        }
    }
    Value::Object(grouped)
}

fn mcp_elicitation_response(
    decision: &str,
    fields: &std::collections::BTreeMap<String, String>,
) -> Value {
    let action = match decision {
        "Deny" => "decline",
        "Cancel" => "cancel",
        _ => "accept",
    };
    let content = if action == "accept" {
        Value::Object(flat_answer_content(fields))
    } else {
        Value::Null
    };
    json!({
        "action": action,
        "content": content,
        "_meta": null,
    })
}

fn flat_answer_content(
    fields: &std::collections::BTreeMap<String, String>,
) -> serde_json::Map<String, Value> {
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
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_request_user_input_response_groups_answers_by_question() {
        let mut elicitation = ElicitationState::new(
            ElicitationId::new("input"),
            RemoteRequestId::Codex(JsonRpcRequestId::new("request")),
            ElicitationKind::UserInput,
        );
        elicitation.options.title = Some("item/tool/requestUserInput".to_string());
        let fields = std::collections::BTreeMap::from([
            ("decision".to_string(), "Answers".to_string()),
            ("answerCount".to_string(), "3".to_string()),
            ("answer.0.id".to_string(), "choice".to_string()),
            ("answer.0.value".to_string(), "first".to_string()),
            ("answer.1.id".to_string(), "choice".to_string()),
            ("answer.1.value".to_string(), "second".to_string()),
            ("answer.2.id".to_string(), "note".to_string()),
            ("answer.2.value".to_string(), "free text".to_string()),
        ]);

        let response = codex_elicitation_response(&elicitation, &fields);

        assert_eq!(
            response,
            json!({
                "answers": {
                    "choice": {"answers": ["first", "second"]},
                    "note": {"answers": ["free text"]},
                }
            })
        );
    }
}
