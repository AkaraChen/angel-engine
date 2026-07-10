mod context;
mod elicitation;
mod input;

use serde_json::{Value, json};

pub(crate) use context::codex_context_patch;
pub(crate) use elicitation::codex_elicitation_response;
pub(crate) use input::codex_user_input;

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
