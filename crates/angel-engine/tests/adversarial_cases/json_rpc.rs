use super::*;
use serde_json::{Value, json};

#[test]
fn json_rpc_rejects_non_frame_values_and_preserves_hostile_ids() {
    assert!(matches!(
        JsonRpcMessage::from_value(Value::Null),
        Err(EngineError::InvalidCommand { .. })
    ));
    assert!(matches!(
        JsonRpcMessage::from_value(json!({})),
        Err(EngineError::InvalidCommand { .. })
    ));

    let message = JsonRpcMessage::from_value(json!({
        "jsonrpc": "2.0",
        "id": {"nested": true},
        "result": {"ok": true}
    }))
    .expect("response with odd id");

    assert!(matches!(
        message,
        JsonRpcMessage::Response {
            id: JsonRpcRequestId::Other(_),
            ..
        }
    ));
}
