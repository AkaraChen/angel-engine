use angel_engine_client::{Client, ClientOptions, StartConversationRequest};
use serde_json::json;

pub(super) fn ready_client() -> (Client, String) {
    let mut client = ClientOptions::builder()
        .acp("fake-agent")
        .need_auth(false)
        .build_client();
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({
                "protocolVersion": 1,
                "agentInfo": {"name": "fake-agent"},
                "agentCapabilities": {
                    "sessionCapabilities": {
                        "additionalDirectories": {}
                    }
                }
            }),
        ))
        .expect("initialize response");

    let start = client
        .start_thread(StartConversationRequest::new().cwd("/repo"))
        .expect("start");
    let conversation_id = start.conversation_id.expect("conversation id");
    client
        .receive_json_value(response(
            &start.request_id.expect("start id"),
            json!({
                "sessionId": "sess-1",
                "modes": {
                    "currentModeId": "default",
                    "availableModes": [
                        {"id": "default", "name": "Default"},
                        {"id": "plan", "name": "Plan"}
                    ]
                },
                "models": {
                    "currentModelId": "kimi-k2",
                    "availableModels": [
                        {"id": "kimi-k2", "name": "Kimi K2"},
                        {"id": "moonshot-v1-128k", "name": "Moonshot v1 128k"}
                    ]
                }
            }),
        ))
        .expect("start response");
    (client, conversation_id)
}

pub(super) fn ready_uri_mode_client() -> (Client, String) {
    let mut client = ClientOptions::builder()
        .acp("fake-agent")
        .need_auth(false)
        .build_client();
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({
                "protocolVersion": 1,
                "agentInfo": {"name": "fake-agent"},
                "agentCapabilities": {"sessionCapabilities": {}}
            }),
        ))
        .expect("initialize response");

    let start = client
        .start_thread(StartConversationRequest::new().cwd("/repo"))
        .expect("start");
    let conversation_id = start.conversation_id.expect("conversation id");
    client
        .receive_json_value(response(
            &start.request_id.expect("start id"),
            json!({
                "sessionId": "sess-1",
                "modes": {
                    "currentModeId": "https://agentclientprotocol.com/protocol/session-modes#agent",
                    "availableModes": [
                        {
                            "id": "https://agentclientprotocol.com/protocol/session-modes#agent",
                            "name": "Agent"
                        },
                        {
                            "id": "https://agentclientprotocol.com/protocol/session-modes#plan",
                            "name": "Plan"
                        }
                    ]
                }
            }),
        ))
        .expect("start response");
    (client, conversation_id)
}

pub(super) fn ready_codex_client() -> (Client, String) {
    let mut client = ClientOptions::builder()
        .codex_app_server("codex")
        .build_client();
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({"userAgent": "codex-test"}),
        ))
        .expect("initialize response");

    let start = client
        .start_thread(StartConversationRequest::new().cwd("/repo"))
        .expect("start");
    let conversation_id = start.conversation_id.expect("conversation id");
    client
        .receive_json_value(response(
            &start.request_id.expect("start id"),
            json!({
                "thread": {
                    "id": "thread-1"
                },
                "cwd": "/repo"
            }),
        ))
        .expect("start response");
    (client, conversation_id)
}
pub(super) fn response(id: &str, result: serde_json::Value) -> serde_json::Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}
