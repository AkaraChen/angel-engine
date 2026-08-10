use angel_engine_client::{
    ClientOptions, DiscoveryRequest, importable_sessions_from_conversations,
};
use serde_json::json;

use super::helpers::response;

#[test]
fn codex_discover_projects_importable_sessions_from_thread_list() {
    let mut client = ClientOptions::builder()
        .codex_app_server("codex")
        .build_client().expect("client");
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({"userAgent": "codex-test"}),
        ))
        .expect("initialize response");

    let discover = client
        .discover_threads(DiscoveryRequest {
            cwd: Some("/tmp/project".to_string()),
            additional_directories: Vec::new(),
            cursor: None,
        })
        .expect("discover threads");
    let request_id = discover.request_id.expect("discover request id");
    assert_eq!(
        discover.update.outgoing[0].value["method"],
        json!("thread/list")
    );

    client
        .receive_json_value(response(
            &request_id,
            json!({
                "data": [
                    {
                        "id": "thread_import_1",
                        "cwd": "/tmp/project",
                        "name": "Imported Codex thread",
                        "updatedAt": 1777770000
                    },
                    {
                        "id": "thread_import_2",
                        "cwd": "/tmp/other",
                        "preview": "preview only",
                        "updatedAt": 1777771000
                    }
                ],
                "nextCursor": "page-2"
            }),
        ))
        .expect("thread list response");

    let sessions = importable_sessions_from_conversations(&client.snapshot().conversations);
    assert_eq!(sessions.len(), 2);
    assert_eq!(sessions[0].remote_id, "thread_import_1");
    assert_eq!(sessions[0].title.as_deref(), Some("Imported Codex thread"));
    assert_eq!(sessions[0].cwd.as_deref(), Some("/tmp/project"));
    assert_eq!(sessions[0].updated_at.as_deref(), Some("1777770000"));
    assert_eq!(sessions[1].remote_id, "thread_import_2");
    assert_eq!(sessions[1].title.as_deref(), Some("preview only"));
}

#[test]
fn acp_discover_projects_importable_sessions_from_session_list() {
    let mut client = ClientOptions::builder()
        .acp("fake-agent")
        .need_auth(false)
        .build_client().expect("client");
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({
                "protocolVersion": 1,
                "agentInfo": {"name": "fake-agent"},
                "agentCapabilities": {
                    "sessionCapabilities": {
                        "list": {},
                        "load": {}
                    }
                }
            }),
        ))
        .expect("initialize response");

    let discover = client
        .discover_threads(DiscoveryRequest {
            cwd: Some("/repo".to_string()),
            additional_directories: Vec::new(),
            cursor: None,
        })
        .expect("discover sessions");
    let request_id = discover.request_id.expect("discover request id");
    assert_eq!(
        discover.update.outgoing[0].value["method"],
        json!("session/list")
    );

    client
        .receive_json_value(response(
            &request_id,
            json!({
                "sessions": [
                    {
                        "sessionId": "acp-sess-1",
                        "cwd": "/repo",
                        "title": "ACP imported",
                        "updatedAt": "2026-01-01T00:00:00Z"
                    }
                ],
                "nextCursor": null
            }),
        ))
        .expect("session list response");

    let sessions = importable_sessions_from_conversations(&client.snapshot().conversations);
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].remote_id, "acp-sess-1");
    assert_eq!(sessions[0].title.as_deref(), Some("ACP imported"));
    assert_eq!(sessions[0].cwd.as_deref(), Some("/repo"));
    assert_eq!(
        sessions[0].updated_at.as_deref(),
        Some("2026-01-01T00:00:00Z")
    );
}

#[test]
fn codex_resume_binds_remote_id_for_import_open() {
    let mut client = ClientOptions::builder()
        .codex_app_server("codex")
        .build_client().expect("client");
    let initialize = client.initialize().expect("initialize");
    client
        .receive_json_value(response(
            &initialize.request_id.expect("initialize id"),
            json!({"userAgent": "codex-test"}),
        ))
        .expect("initialize response");

    let resume = client
        .resume_thread(angel_engine_client::ResumeConversationRequest {
            additional_directories: Vec::new(),
            cwd: Some("/tmp/project".to_string()),
            hydrate: true,
            remote_id: "imported-remote-1".to_string(),
        })
        .expect("resume imported session");
    let conversation_id = resume.conversation_id.expect("conversation id");
    assert_eq!(
        resume.update.outgoing[0].value["method"],
        json!("thread/resume")
    );
    assert_eq!(
        resume.update.outgoing[0].value["params"]["threadId"],
        json!("imported-remote-1")
    );

    client
        .receive_json_value(response(
            &resume.request_id.expect("resume id"),
            json!({
                "thread": {
                    "id": "imported-remote-1",
                    "turns": []
                }
            }),
        ))
        .expect("resume response");

    let conversation = client
        .snapshot()
        .conversations
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
        .expect("conversation");
    assert_eq!(conversation.remote_id.as_deref(), Some("imported-remote-1"));
    assert_eq!(conversation.remote_kind, "known");
}
