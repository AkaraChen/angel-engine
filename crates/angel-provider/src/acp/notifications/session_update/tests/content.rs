use serde_json::json;

use super::*;

#[test]
fn agent_message_chunk_maps_resource_link_to_resource_ref() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = ready_conversation(&adapter, &mut engine);
    let turn_id = start_ready_turn(&mut engine, &conversation_id);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "agent_message_chunk",
                    "content": {
                        "type": "resource_link",
                        "name": "README",
                        "uri": "file:///repo/README.md"
                    }
                }
            }),
        )
        .expect("agent message update");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::AssistantDelta {
            conversation_id: id,
            turn_id: actual_turn_id,
            delta: ContentDelta::ResourceRef(uri),
        }] if id == &conversation_id
            && actual_turn_id == &turn_id
            && uri == "file:///repo/README.md"
    ));
}

#[test]
fn agent_thought_chunk_preserves_unknown_content_as_structured_delta() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(angel_engine::ProtocolFlavor::Acp, adapter.capabilities());
    let conversation_id = ready_conversation(&adapter, &mut engine);
    let turn_id = start_ready_turn(&mut engine, &conversation_id);

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "agent_thought_chunk",
                    "content": {
                        "type": "image",
                        "data": "ZmFrZQ==",
                        "mimeType": "image/png"
                    }
                }
            }),
        )
        .expect("agent thought update");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::ReasoningDelta {
            conversation_id: id,
            turn_id: actual_turn_id,
            delta: ContentDelta::Structured(value),
        }] if id == &conversation_id
            && actual_turn_id == &turn_id
            && value.contains("\"type\":\"image\"")
            && value.contains("\"mimeType\":\"image/png\"")
    ));
}

#[test]
fn hydration_restores_user_text_and_markdown_attachment_card() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::Acp,
        RuntimeCapabilities::new("test-acp"),
        adapter.capabilities(),
    );
    let conversation_id = ConversationId::new("conv");
    let mut capabilities = adapter.capabilities();
    capabilities.lifecycle.load = CapabilitySupport::Supported;
    engine
        .apply_event(EngineEvent::ConversationDiscovered {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("sess".to_string()),
            context: ContextPatch::empty(),
            capabilities,
        })
        .expect("discover conversation");
    engine
        .plan_command(EngineCommand::ResumeConversation {
            target: angel_engine::ResumeTarget::Conversation(conversation_id),
        })
        .expect("resume plan");

    let output = adapter
        .decode_notification(
            &engine,
            "session/update",
            &json!({
                "sessionId": "sess",
                "update": {
                    "sessionUpdate": "user_message_chunk",
                    "content": [
                        { "type": "text", "text": "这个讲了什么" },
                        {
                            "type": "text",
                            "text": "Attached text resource: attachment:///PRD_%E6%99%BA%E8%83%BD%E4%BD%93.md\nMIME type: text/markdown\n\n# 智能体广场\n\n内容"
                        }
                    ]
                }
            }),
        )
        .expect("hydration update");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::HistoryReplayChunk { entry, .. }]
            if entry.role == HistoryRole::User
                && matches!(
                    &entry.content,
                    ContentDelta::Parts(parts)
                        if matches!(
                            parts.as_slice(),
                            [
                                ContentPart::Text(text),
                                ContentPart::File { data, mime_type, name },
                            ] if text == "这个讲了什么"
                                && data == "# 智能体广场\n\n内容"
                                && mime_type == "text/markdown"
                                && name.as_deref() == Some("PRD_智能体.md")
                        )
                )
    ));
}
