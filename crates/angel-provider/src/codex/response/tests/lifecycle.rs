use super::super::*;

#[test]
fn thread_start_advertises_codex_slash_commands() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let request_id = engine
        .plan_command(angel_engine::EngineCommand::StartConversation {
            params: angel_engine::StartConversationParams::default(),
        })
        .expect("start plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
                "thread": {
                    "id": "thread_1",
                    "cwd": "/tmp/project"
                }
            }),
        )
        .expect("thread start response");

    assert!(matches!(
        output.events.as_slice(),
        [
            EngineEvent::ConversationReady { .. },
            EngineEvent::AvailableCommandsUpdated { commands, .. },
            EngineEvent::SessionModesUpdated { modes, .. },
            EngineEvent::SessionPermissionModesUpdated { modes: permission_modes, .. },
            EngineEvent::SessionConfigOptionsUpdated { options, .. }
        ] if commands.iter().any(|command| command.name == "plan")
            && commands.iter().any(|command| command.name == "compact")
            && commands.iter().any(|command| command.name == "fast")
            && commands.iter().all(|command| !matches!(
                command.name.as_str(),
                "copy" | "raw" | "theme" | "quit" | "review" | "mention"
            ))
            && modes.current_mode_id == "default"
            && modes.available_modes.iter().any(|mode| mode.id == "default")
            && modes.available_modes.iter().any(|mode| mode.id == "plan")
            && permission_modes.current_mode_id == "on-request"
            && permission_modes.available_modes.iter().any(|mode| mode.id == "untrusted")
            && permission_modes.available_modes.iter().any(|mode| mode.id == "on-request")
            && permission_modes.available_modes.iter().any(|mode| mode.id == "never")
            && options.iter().any(|option| option.id == "reasoning"
                && option.values.iter().any(|value| value.value == "none")
                && option.values.iter().any(|value| value.value == "low")
                && option.values.iter().any(|value| value.value == "medium")
                && option.values.iter().any(|value| value.value == "high")
                && option.values.iter().any(|value| value.value == "xhigh"))
    ));
}

#[test]
fn thread_list_discovers_threads_with_common_metadata() {
    let adapter = CodexAdapter::app_server();
    let mut engine = AngelEngine::with_available_runtime(
        angel_engine::ProtocolFlavor::CodexAppServer,
        angel_engine::RuntimeCapabilities::new("test"),
        adapter.capabilities(),
    );
    let request_id = engine
        .plan_command(angel_engine::EngineCommand::DiscoverConversations {
            params: angel_engine::DiscoverConversationsParams::default(),
        })
        .expect("discover plan")
        .request_id
        .expect("request id");

    let output = adapter
        .decode_response(
            &engine,
            &request_id,
            &json!({
                "data": [
                    {
                        "id": "thread_1",
                        "cwd": "/tmp/project",
                        "name": "Fix tests",
                        "preview": "older preview",
                        "updatedAt": 1777770000
                    }
                ],
                "nextCursor": "next-page",
                "backwardsCursor": null
            }),
        )
        .expect("thread list response");

    assert!(matches!(
        output.events.as_slice(),
        [EngineEvent::ConversationDiscovered {
            id,
            remote: RemoteConversationId::Known(thread_id),
            context,
            ..
        }, EngineEvent::ConversationDiscoveryPage {
            cursor,
            next_cursor,
        }] if id.as_str() == "codex-thread-thread_1"
            && thread_id == "thread_1"
            && cursor.is_none()
            && next_cursor.as_deref() == Some("next-page")
            && context.updates.iter().any(|update| matches!(
                update,
                angel_engine::ContextUpdate::Cwd { cwd: Some(cwd), .. } if cwd == "/tmp/project"
            ))
            && context.updates.iter().any(|update| matches!(
                update,
                angel_engine::ContextUpdate::Raw { key, value, .. }
                    if key == "conversation.title" && value == "Fix tests"
        ))
    ));
}
