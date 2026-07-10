use angel_engine::ContextPatch;
use serde_json::Value;

use super::super::commands::{SERVICE_TIER_CONTEXT_KEY, SERVICE_TIER_NONE};

pub(crate) fn codex_context_patch(result: &Value) -> ContextPatch {
    let mut patch = ContextPatch::empty();
    if let Some(model) = result.get("model").and_then(Value::as_str) {
        patch.updates.push(angel_engine::ContextUpdate::Model {
            scope: angel_engine::ContextScope::Conversation,
            model: Some(model.to_string()),
        });
    }
    if let Some(service_tier) = result.get("serviceTier") {
        let value = service_tier
            .as_str()
            .unwrap_or(SERVICE_TIER_NONE)
            .to_string();
        patch.updates.push(angel_engine::ContextUpdate::Raw {
            scope: angel_engine::ContextScope::Conversation,
            key: SERVICE_TIER_CONTEXT_KEY.to_string(),
            value,
        });
    }
    if let Some(cwd) = result.get("cwd").and_then(Value::as_str) {
        patch.updates.push(angel_engine::ContextUpdate::Cwd {
            scope: angel_engine::ContextScope::Conversation,
            cwd: Some(cwd.to_string()),
        });
    }
    patch
}
