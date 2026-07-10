use super::super::*;
use serde_json::json;

#[test]
fn acp_cancel_turn_responds_cancelled_to_pending_permission_request() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone(), "active")
        .turn_id
        .unwrap();

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("perm"),
            "session/request_permission",
            json!({
                "sessionId": "sess",
                "toolCallId": "tool-1",
                "title": "Run tool"
            }),
        ),
    );
    let elicitation_id = engine.conversations[&conversation_id]
        .elicitations
        .keys()
        .next()
        .cloned()
        .unwrap();

    let cancel = engine
        .plan_command(EngineCommand::CancelTurn {
            conversation_id: conversation_id.clone(),
            turn_id: Some(turn_id),
        })
        .expect("cancel turn");
    let output = adapter
        .encode_effect(&engine, &cancel.effects[0], &TransportOptions::default())
        .expect("encode cancel");

    assert!(matches!(
        output.messages.as_slice(),
        [
            JsonRpcMessage::Notification { method, .. },
            JsonRpcMessage::Response { id, result },
        ] if method == "session/cancel"
            && id == &JsonRpcRequestId::new("perm")
            && result["outcome"]["outcome"] == json!("cancelled")
    ));
    apply_transport_output(&mut engine, &output).expect("apply cancel output");
    assert!(matches!(
        engine.conversations[&conversation_id].elicitations[&elicitation_id].phase,
        ElicitationPhase::Cancelled
    ));
}

#[test]
fn acp_cancel_turn_responds_cancel_to_pending_form_elicitation() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone(), "active")
        .turn_id
        .unwrap();

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("ask"),
            "elicitation/create",
            json!({
                "mode": "form",
                "sessionId": "sess",
                "message": "Need input",
                "requestedSchema": {
                    "type": "object",
                    "properties": {
                        "answer": {"type": "string", "title": "Answer"}
                    }
                }
            }),
        ),
    );

    let cancel = engine
        .plan_command(EngineCommand::CancelTurn {
            conversation_id,
            turn_id: Some(turn_id),
        })
        .expect("cancel turn");
    let output = adapter
        .encode_effect(&engine, &cancel.effects[0], &TransportOptions::default())
        .expect("encode cancel");

    assert!(matches!(
        output.messages.as_slice(),
        [
            JsonRpcMessage::Notification { method, .. },
            JsonRpcMessage::Response { id, result },
        ] if method == "session/cancel"
            && id == &JsonRpcRequestId::new("ask")
            && result["action"] == json!("cancel")
    ));
}

#[test]
fn acp_cancel_turn_with_engine_request_id_is_notification_and_completes_locally() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    let turn_id = TurnId::new("turn");
    let engine_request_id = JsonRpcRequestId::new("cancel-local");
    let effect = ProtocolEffect::new(ProtocolFlavor::Acp, ProtocolMethod::CancelTurn)
        .request_id(engine_request_id.clone())
        .conversation_id(conversation_id)
        .turn_id(turn_id);

    let output = adapter
        .encode_effect(&engine, &effect, &TransportOptions::default())
        .expect("encode cancel");

    assert!(matches!(
        output.messages.as_slice(),
        [JsonRpcMessage::Notification { method, params }]
            if method == "session/cancel" && params["sessionId"] == json!("sess")
    ));
    assert_eq!(output.completed_requests, vec![engine_request_id]);
}

#[test]
fn acp_elicitation_schema_preserves_typed_constraints_without_stringly_metadata() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::request(
            JsonRpcRequestId::new("ask-schema"),
            "elicitation/create",
            json!({
                "mode": "form",
                "sessionId": "sess",
                "message": "Configure run",
                "requestedSchema": {
                    "type": "object",
                    "required": ["path", "retries"],
                    "properties": {
                        "path": {
                            "type": "string",
                            "title": "Path",
                            "format": "uri",
                            "pattern": "^file://",
                            "default": "file:///repo/src/lib.rs"
                        },
                        "retries": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5,
                            "default": 2
                        },
                        "tags": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": ["fast", "slow"]
                            },
                            "minItems": 1,
                            "uniqueItems": true
                        }
                    }
                }
            }),
        ),
    );

    let elicitation = engine.conversations[&conversation_id]
        .elicitations
        .values()
        .next()
        .expect("elicitation");
    let path_schema = elicitation
        .options
        .questions
        .iter()
        .find(|question| question.id == "path")
        .and_then(|question| question.schema.as_ref())
        .expect("path schema");
    assert_eq!(path_schema.value_type, QuestionValueType::String);
    assert!(path_schema.required);
    assert_eq!(path_schema.format.as_deref(), Some("uri"));
    assert_eq!(path_schema.constraints.pattern.as_deref(), Some("^file://"));
    assert_eq!(
        path_schema.default_value.as_deref(),
        Some("file:///repo/src/lib.rs")
    );

    let retries_schema = elicitation
        .options
        .questions
        .iter()
        .find(|question| question.id == "retries")
        .and_then(|question| question.schema.as_ref())
        .expect("retries schema");
    assert_eq!(retries_schema.value_type, QuestionValueType::Integer);
    assert!(retries_schema.required);
    assert_eq!(retries_schema.constraints.minimum.as_deref(), Some("1"));
    assert_eq!(retries_schema.constraints.maximum.as_deref(), Some("5"));
    assert_eq!(retries_schema.default_value.as_deref(), Some("2"));

    let tags = elicitation
        .options
        .questions
        .iter()
        .find(|question| question.id == "tags")
        .expect("tags question");
    let tags_schema = tags.schema.as_ref().expect("tags schema");
    assert_eq!(tags_schema.value_type, QuestionValueType::Array);
    assert_eq!(tags_schema.item_value_type, Some(QuestionValueType::String));
    assert!(tags_schema.multiple);
    assert!(!tags_schema.required);
    assert_eq!(tags_schema.constraints.min_items.as_deref(), Some("1"));
    assert_eq!(tags_schema.constraints.unique_items, Some(true));
    assert_eq!(
        tags.options
            .iter()
            .map(|option| option.label.as_str())
            .collect::<Vec<_>>(),
        vec!["fast", "slow"]
    );
}
