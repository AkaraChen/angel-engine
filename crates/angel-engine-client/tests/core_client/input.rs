use angel_engine_client::{ClientError, ClientInput, ThreadEvent};
use serde_json::json;

use super::helpers::ready_client;

#[test]
fn inputs_event_encodes_every_supported_user_input_shape_for_acp() {
    let (mut client, conversation_id) = ready_client();

    let sent = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::input(vec![
            ClientInput::text("inspect these inputs"),
            ClientInput::ResourceLink {
                name: "docs".to_string(),
                uri: "file:///repo/docs/readme.md".to_string(),
                mime_type: Some("text/markdown".to_string()),
                title: Some("Readme".to_string()),
                description: Some("Project docs".to_string()),
            },
            ClientInput::file_mention(
                "lib.rs",
                "/repo/src/lib.rs",
                Some("text/x-rust".to_string()),
            ),
            ClientInput::EmbeddedTextResource {
                uri: "memory://note".to_string(),
                text: "inline note".to_string(),
                mime_type: Some("text/plain".to_string()),
            },
            ClientInput::embedded_blob_resource(
                "file:///repo/archive.bin",
                "AAEC",
                Some("application/zip".to_string()),
                Some("archive.bin".to_string()),
            ),
            ClientInput::image(
                "iVBORw0KGgo=",
                "image/png",
                Some("screenshot.png".to_string()),
            ),
            ClientInput::raw_content_block(json!({
                "type": "text",
                "text": "raw block"
            })),
        ]))
        .expect("send inputs");

    assert_eq!(
        sent.update.outgoing[0].value["method"],
        json!("session/prompt")
    );
    let prompt = &sent.update.outgoing[0].value["params"]["prompt"];
    assert_eq!(prompt.as_array().expect("prompt blocks").len(), 7);
    assert_eq!(prompt[0]["type"], json!("text"));
    assert_eq!(prompt[0]["text"], json!("inspect these inputs"));
    assert_eq!(prompt[1]["type"], json!("resource_link"));
    assert_eq!(prompt[1]["name"], json!("docs"));
    assert_eq!(prompt[1]["mimeType"], json!("text/markdown"));
    assert_eq!(prompt[1]["title"], json!("Readme"));
    assert_eq!(prompt[2]["type"], json!("resource_link"));
    assert_eq!(prompt[2]["name"], json!("lib.rs"));
    assert_eq!(prompt[2]["uri"], json!("file:///repo/src/lib.rs"));
    assert_eq!(prompt[3]["type"], json!("resource"));
    assert_eq!(prompt[3]["resource"]["text"], json!("inline note"));
    assert_eq!(prompt[4]["type"], json!("resource"));
    assert_eq!(prompt[4]["resource"]["blob"], json!("AAEC"));
    assert_eq!(prompt[5]["type"], json!("image"));
    assert_eq!(prompt[5]["data"], json!("iVBORw0KGgo="));
    assert_eq!(prompt[5]["mimeType"], json!("image/png"));
    assert_eq!(prompt[6]["type"], json!("text"));
    assert_eq!(prompt[6]["text"], json!("raw block"));

    let turn = client
        .thread(&conversation_id)
        .turn(&sent.turn_id.expect("turn id"))
        .expect("turn snapshot");
    assert!(turn.input_text.contains("inspect these inputs"));
    assert!(turn.input_text.contains("/repo/src/lib.rs"));
}

#[test]
fn send_inputs_rejects_image_without_name() {
    let (mut client, conversation_id) = ready_client();

    let result = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::input(vec![ClientInput::Image {
            data: "ZmFrZQ==".to_string(),
            mime_type: "image/png".to_string(),
            name: None,
        }]));

    match result {
        Err(ClientError::InvalidInput { message }) => {
            assert!(message.contains("image"));
        }
        other => panic!("expected InvalidInput error, got {other:?}"),
    }
}

#[test]
fn send_inputs_rejects_embedded_blob_resource_without_name() {
    let (mut client, conversation_id) = ready_client();

    let result = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::input(vec![
            ClientInput::EmbeddedBlobResource {
                uri: "file:///repo/archive.bin".to_string(),
                data: "AAEC".to_string(),
                mime_type: Some("application/zip".to_string()),
                name: None,
            },
        ]));

    match result {
        Err(ClientError::InvalidInput { message }) => {
            assert!(message.contains("embedded blob resource"));
        }
        other => panic!("expected InvalidInput error, got {other:?}"),
    }
}

#[test]
fn send_inputs_accepts_image_with_name() {
    let (mut client, conversation_id) = ready_client();

    let result = client
        .thread(&conversation_id)
        .send_event(ThreadEvent::input(vec![ClientInput::image(
            "ZmFrZQ==",
            "image/png",
            Some("screenshot.png".to_string()),
        )]));

    assert!(result.is_ok(), "expected Ok, got {result:?}");
}
