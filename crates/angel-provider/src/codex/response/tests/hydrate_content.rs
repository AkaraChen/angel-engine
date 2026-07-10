use super::super::*;

#[test]
fn thread_read_hydrates_rollout_turn_items_into_history_replay() {
    let adapter = CodexAdapter::app_server();
    let conversation_id = ConversationId::new("conv");
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("thread_1".to_string()),
            op: angel_engine::ProvisionOp::Resume,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provisioned");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("thread_1".to_string())),
            context: Default::default(),
            capabilities: Some(adapter.capabilities()),
        })
        .expect("conversation ready");

    let request_id = engine
        .plan_command(angel_engine::EngineCommand::ReadConversation {
            conversation_id: conversation_id.clone(),
        })
        .expect("read plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
                "thread": {
                    "id": "thread_1",
                    "turns": [
                        {
                            "id": "turn_1",
                            "items": [
                                {
                                    "type": "userMessage",
                                    "content": [{ "type": "text", "text": "hello" }]
                                },
                                {
                                    "type": "reasoning",
                                    "summary": ["thinking"]
                                },
                                {
                                    "id": "exec-1",
                                    "type": "commandExecution",
                                    "status": "completed",
                                    "command": "cargo test"
                                },
                                {
                                    "type": "agentMessage",
                                    "text": "done"
                                }
                            ]
                        }
                    ]
                }
            }),
        )
        .expect("thread read response");

    let replay = output
        .events
        .iter()
        .filter_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
            _ => None,
        })
        .collect::<Vec<_>>();

    assert_eq!(replay.len(), 4);
    assert_eq!(replay[0].role, HistoryRole::User);
    assert_eq!(replay[1].role, HistoryRole::Reasoning);
    assert_eq!(replay[2].role, HistoryRole::Tool);
    assert_eq!(
        replay[2].tool.as_ref().and_then(|tool| tool.kind.as_ref()),
        Some(&ActionKind::Command)
    );
    assert_eq!(replay[3].role, HistoryRole::Assistant);
}

#[test]
fn thread_read_hydrates_custom_tool_call_raw_input_as_json() {
    let adapter = CodexAdapter::app_server();
    let conversation_id = ConversationId::new("conv");
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    engine
        .apply_event(EngineEvent::ConversationProvisionStarted {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("thread_1".to_string()),
            op: angel_engine::ProvisionOp::Resume,
            capabilities: adapter.capabilities(),
        })
        .expect("conversation provisioned");
    engine
        .apply_event(EngineEvent::ConversationReady {
            id: conversation_id.clone(),
            remote: Some(RemoteConversationId::Known("thread_1".to_string())),
            context: Default::default(),
            capabilities: Some(adapter.capabilities()),
        })
        .expect("conversation ready");

    let request_id = engine
        .plan_command(angel_engine::EngineCommand::ReadConversation { conversation_id })
        .expect("read plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
                "thread": {
                    "id": "thread_1",
                    "turns": [
                        {
                            "id": "turn_1",
                            "items": [
                                {
                                    "id": "patch-1",
                                    "type": "custom_tool_call",
                                    "name": "apply_patch",
                                    "input": "*** Begin Patch\n*** End Patch\n",
                                    "status": "completed"
                                }
                            ]
                        }
                    ]
                }
            }),
        )
        .expect("thread read response");

    let tool = output
        .events
        .iter()
        .find_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => entry.tool.as_ref(),
            _ => None,
        })
        .expect("tool replay");
    let raw_input: Value = serde_json::from_str(tool.raw_input.as_deref().expect("raw input"))
        .expect("raw input json");

    assert_eq!(tool.kind.as_ref(), Some(&ActionKind::FileChange));
    assert_eq!(raw_input["name"], json!("apply_patch"));
    assert_eq!(
        raw_input["input"],
        json!("*** Begin Patch\n*** End Patch\n")
    );
}

#[test]
fn thread_resume_preserves_user_image_content_parts() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let request_id = engine
        .plan_command(angel_engine::EngineCommand::ResumeConversation {
            target: angel_engine::ResumeTarget::Remote {
                id: "thread_1".to_string(),
                hydrate: true,
                cwd: None,
            },
        })
        .expect("resume plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
                "thread": {
                    "id": "thread_1",
                    "turns": [
                        {
                            "items": [
                                {
                                    "type": "userMessage",
                                    "content": [
                                        { "type": "text", "text": "look" },
                                        {
                                            "type": "image",
                                            "url": "data:image/png;base64,ZmFrZQ==",
                                            "name": "sample.png"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }),
        )
        .expect("thread resume response");

    let entry = output
        .events
        .iter()
        .find_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
            _ => None,
        })
        .expect("history replay entry");

    assert_eq!(entry.role, HistoryRole::User);
    assert!(matches!(
        &entry.content,
        ContentDelta::Parts(parts)
            if matches!(
                parts.as_slice(),
                [
                    ContentPart::Text(text),
                    ContentPart::Image { data, mime_type, name }
                ] if text == "look"
                    && data == "ZmFrZQ=="
                    && mime_type == "image/png"
                    && name.as_deref() == Some("sample.png")
        )
    ));
}

#[test]
fn thread_resume_restores_codex_text_file_fallback_parts() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let request_id = engine
        .plan_command(angel_engine::EngineCommand::ResumeConversation {
            target: angel_engine::ResumeTarget::Remote {
                id: "thread_1".to_string(),
                hydrate: true,
                cwd: None,
            },
        })
        .expect("resume plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
                "thread": {
                    "id": "thread_1",
                    "turns": [
                        {
                            "items": [
                                {
                                    "type": "userMessage",
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": "Attached text resource: attachment:///notes.txt\nMIME type: text/plain\n\nhello from a file"
                                        },
                                        {
                                            "type": "text",
                                            "text": "Attached file: archive.zip\nURI: attachment:///archive.zip\nMIME type: application/zip\nEncoding: base64\n\nUEsDBAo="
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }),
        )
        .expect("thread resume response");

    let entry = output
        .events
        .iter()
        .find_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
            _ => None,
        })
        .expect("history replay entry");

    assert_eq!(entry.role, HistoryRole::User);
    assert!(matches!(
        &entry.content,
        ContentDelta::Parts(parts)
            if matches!(
                parts.as_slice(),
                [
                    ContentPart::File { data: text_data, mime_type: text_mime, name: text_name },
                    ContentPart::File { data: blob_data, mime_type: blob_mime, name: blob_name },
                ] if text_data == "hello from a file"
                    && text_mime == "text/plain"
                    && text_name.as_deref() == Some("notes.txt")
                    && blob_data == "UEsDBAo="
                    && blob_mime == "application/zip"
                    && blob_name.as_deref() == Some("archive.zip")
        )
    ));
}

#[test]
fn thread_resume_restores_user_text_and_markdown_attachment_card() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let request_id = engine
        .plan_command(angel_engine::EngineCommand::ResumeConversation {
            target: angel_engine::ResumeTarget::Remote {
                id: "thread_1".to_string(),
                hydrate: true,
                cwd: None,
            },
        })
        .expect("resume plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
                "thread": {
                    "id": "thread_1",
                    "turns": [
                        {
                            "items": [
                                {
                                    "type": "userMessage",
                                    "content": [
                                        { "type": "input_text", "text": "这个讲了什么" },
                                        {
                                            "type": "input_text",
                                            "text": "Attached text resource: attachment:///PRD_%E6%99%BA%E8%83%BD%E4%BD%93.md\nMIME type: text/markdown\n\n# 智能体广场\n\n内容"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }),
        )
        .expect("thread resume response");

    let entry = output
        .events
        .iter()
        .find_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
            _ => None,
        })
        .expect("history replay entry");

    assert_eq!(entry.role, HistoryRole::User);
    assert!(matches!(
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
    ));
}
