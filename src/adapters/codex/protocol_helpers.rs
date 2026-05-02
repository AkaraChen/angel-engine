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

pub(crate) fn codex_elicitation_response(kind: ElicitationKind, decision: &str) -> Value {
    match kind {
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
        ElicitationKind::UserInput => json!({
            "answers": {},
        }),
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
