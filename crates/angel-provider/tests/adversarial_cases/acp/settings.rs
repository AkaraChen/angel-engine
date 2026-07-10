use super::super::*;
use serde_json::json;

#[test]
fn acp_bad_model_and_effort_updates_are_encoded_for_server_validation() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    {
        let conversation = engine.conversations.get_mut(&conversation_id).unwrap();
        conversation.config_options.push(SessionConfigOption {
            id: "model".to_string(),
            name: "Model".to_string(),
            description: None,
            category: Some("model".to_string()),
            current_value: "old-model".to_string(),
            values: Vec::new(),
        });
        conversation.config_options.push(SessionConfigOption {
            id: "thought_level".to_string(),
            name: "Thought level".to_string(),
            description: None,
            category: Some("reasoning".to_string()),
            current_value: "medium".to_string(),
            values: Vec::new(),
        });
    }

    let plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch {
                updates: vec![
                    ContextUpdate::Model {
                        scope: ContextScope::TurnAndFuture,
                        model: Some("not-a-real-model".to_string()),
                    },
                    ContextUpdate::Reasoning {
                        scope: ContextScope::TurnAndFuture,
                        reasoning: Some(ReasoningProfile {
                            effort: Some("sideways".to_string()),
                        }),
                    },
                ],
            },
        })
        .expect("acp context update");

    assert_eq!(plan.effects.len(), 2);
    let encoded_effects = plan
        .effects
        .iter()
        .map(|effect| encode_request(&adapter, &engine, effect))
        .collect::<Vec<_>>();
    assert_eq!(encoded_effects[0].2["value"], json!("not-a-real-model"));
    assert_eq!(encoded_effects[1].2["value"], json!("sideways"));
    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(
        conversation
            .context
            .model
            .effective()
            .and_then(Option::as_deref),
        Some("not-a-real-model")
    );
    assert_eq!(
        conversation
            .context
            .reasoning
            .effective()
            .and_then(Option::as_ref)
            .and_then(|reasoning| reasoning.effort.as_deref()),
        Some("sideways")
    );

    for (request_id, _, _) in encoded_effects {
        decode_and_apply(
            &adapter,
            &mut engine,
            JsonRpcMessage::error(Some(request_id), -32602, "invalid config value", None),
        );
    }

    let next = start_turn(&mut engine, conversation_id, "recover");
    let (_, method, _) = encode_request(&adapter, &engine, &next.effects[0]);
    assert_eq!(method, "session/prompt");
}

#[test]
fn acp_malformed_current_mode_update_rejects_without_clearing_mode() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    engine
        .apply_event(EngineEvent::SessionModesUpdated {
            conversation_id: conversation_id.clone(),
            modes: SessionModeState {
                current_mode_id: "default".to_string(),
                available_modes: vec![SessionMode {
                    id: "default".to_string(),
                    name: "Default".to_string(),
                    description: None,
                }],
            },
        })
        .expect("seed modes");

    let error = adapter
        .decode_message(
            &engine,
            &JsonRpcMessage::notification(
                "session/update",
                json!({
                    "sessionId": "sess",
                    "update": {
                        "sessionUpdate": "current_mode_update"
                    }
                }),
            ),
        )
        .expect_err("malformed ACP current mode update should fail");

    assert!(matches!(
        error,
        EngineError::InvalidCommand { message }
            if message.contains("current mode update missing modeId/currentModeId")
    ));
    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(
        conversation
            .context
            .mode
            .effective()
            .and_then(Option::as_ref)
            .map(|mode| mode.id.as_str()),
        Some("default")
    );
}

#[test]
fn acp_neutral_update_context_uses_config_option_when_available() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    engine
        .conversations
        .get_mut(&conversation_id)
        .unwrap()
        .config_options
        .push(SessionConfigOption {
            id: "thought_level".to_string(),
            name: "Thought level".to_string(),
            description: None,
            category: Some("reasoning".to_string()),
            current_value: "medium".to_string(),
            values: Vec::new(),
        });
    let effect = ProtocolEffect::new(ProtocolFlavor::Acp, ProtocolMethod::UpdateContext)
        .request_id(JsonRpcRequestId::new("ctx"))
        .conversation_id(conversation_id)
        .field("contextUpdate", "reasoning")
        .field("effort", "high");

    let (_, method, params) = encode_request(&adapter, &engine, &effect);

    assert_eq!(method, "session/set_config_option");
    assert_eq!(params["sessionId"], json!("sess"));
    assert_eq!(params["configId"], json!("thought_level"));
    assert_eq!(params["value"], json!("high"));
}

#[test]
fn acp_model_config_write_prefers_exact_model_option_over_model_category() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    engine
        .conversations
        .get_mut(&conversation_id)
        .unwrap()
        .config_options
        .extend([
            SessionConfigOption {
                id: "provider".to_string(),
                name: "Provider".to_string(),
                description: None,
                category: Some("model".to_string()),
                current_value: "openai-codex".to_string(),
                values: Vec::new(),
            },
            SessionConfigOption {
                id: "model".to_string(),
                name: "Model".to_string(),
                description: None,
                category: Some("model".to_string()),
                current_value: "gpt-5.4".to_string(),
                values: Vec::new(),
            },
        ]);
    let effect = ProtocolEffect::new(ProtocolFlavor::Acp, ProtocolMethod::UpdateContext)
        .request_id(JsonRpcRequestId::new("ctx"))
        .conversation_id(conversation_id)
        .field("contextUpdate", "model")
        .field("model", "gpt-5.3-codex");

    let (_, method, params) = encode_request(&adapter, &engine, &effect);

    assert_eq!(method, "session/set_config_option");
    assert_eq!(params["sessionId"], json!("sess"));
    assert_eq!(params["configId"], json!("model"));
    assert_eq!(params["value"], json!("gpt-5.3-codex"));
}

#[test]
fn acp_provider_config_option_does_not_pollute_model_settings() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let plan = engine
        .plan_command(EngineCommand::StartConversation {
            params: StartConversationParams {
                cwd: Some("/repo".to_string()),
                additional_directories: Vec::new(),
                context: ContextPatch::empty(),
            },
        })
        .expect("start conversation");
    let conversation_id = plan.conversation_id.clone().unwrap();
    let request_id = plan.request_id.clone().unwrap();

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::response(
            request_id,
            json!({
                "sessionId": "sess",
                "configOptions": [
                    {
                        "id": "provider",
                        "name": "Provider",
                        "category": "model",
                        "currentValue": "openai-codex",
                        "options": [{"value": "openai-codex", "name": "OpenAI"}]
                    },
                    {
                        "id": "model",
                        "name": "Model",
                        "category": "model",
                        "currentValue": "gpt-5.4",
                        "options": [{"value": "gpt-5.4", "name": "GPT-5.4"}]
                    }
                ]
            }),
        ),
    );

    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(
        conversation
            .config_options
            .iter()
            .find(|option| option.id == "provider")
            .and_then(|option| option.category.as_deref()),
        Some("provider")
    );
    let settings = engine
        .conversation_settings(conversation_id.clone())
        .expect("conversation settings");
    assert_eq!(
        settings.model_list.current_model_id.as_deref(),
        Some("gpt-5.4")
    );
    assert_eq!(
        settings.model_list.config_option_id.as_deref(),
        Some("model")
    );
}

#[test]
fn acp_neutral_update_context_without_supported_write_completes_locally() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    let request_id = JsonRpcRequestId::new("ctx");
    let effect = ProtocolEffect::new(ProtocolFlavor::Acp, ProtocolMethod::UpdateContext)
        .request_id(request_id.clone())
        .conversation_id(conversation_id)
        .field("contextUpdate", "sandbox")
        .field("sandbox", "read-only");

    let output = adapter
        .encode_effect(&engine, &effect, &TransportOptions::default())
        .expect("encode context");

    assert!(output.messages.is_empty());
    assert_eq!(output.completed_requests, vec![request_id]);
}

#[test]
fn acp_set_model_empty_response_updates_current_model_state() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    engine
        .apply_event(EngineEvent::SessionModelsUpdated {
            conversation_id: conversation_id.clone(),
            models: SessionModelState {
                current_model_id: "old-model".to_string(),
                available_models: vec![
                    SessionModel {
                        id: "old-model".to_string(),
                        name: "Old".to_string(),
                        description: None,
                    },
                    SessionModel {
                        id: "new-model".to_string(),
                        name: "New".to_string(),
                        description: None,
                    },
                ],
            },
        })
        .expect("models update");

    let plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch::one(ContextUpdate::Model {
                scope: ContextScope::TurnAndFuture,
                model: Some("new-model".to_string()),
            }),
        })
        .expect("set model");
    let request_id = plan.request_id.clone().unwrap();
    let (_, method, params) = encode_request(&adapter, &engine, &plan.effects[0]);
    assert_eq!(method, "session/set_model");
    assert_eq!(params["sessionId"], json!("sess"));
    assert_eq!(params["modelId"], json!("new-model"));

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::response(request_id, json!({})),
    );

    let conversation = &engine.conversations[&conversation_id];
    assert_eq!(
        conversation
            .context
            .model
            .effective()
            .and_then(|model| model.as_ref())
            .map(String::as_str),
        Some("new-model")
    );
    assert_eq!(
        conversation
            .model_state
            .as_ref()
            .map(|models| models.current_model_id.as_str()),
        Some("new-model")
    );
}

#[test]
fn acp_set_model_rpc_error_leaves_current_model_state_unchanged() {
    let adapter = AcpAdapter::standard();
    let mut engine = acp_engine(&adapter);
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("sess".to_string()),
        adapter.capabilities(),
    );
    engine
        .apply_event(EngineEvent::SessionModelsUpdated {
            conversation_id: conversation_id.clone(),
            models: SessionModelState {
                current_model_id: "old-model".to_string(),
                available_models: Vec::new(),
            },
        })
        .expect("models update");
    let plan = engine
        .plan_command(EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch::one(ContextUpdate::Model {
                scope: ContextScope::TurnAndFuture,
                model: Some("new-model".to_string()),
            }),
        })
        .expect("set model");
    let request_id = plan.request_id.clone().unwrap();

    decode_and_apply(
        &adapter,
        &mut engine,
        JsonRpcMessage::error(Some(request_id), -32602, "invalid model", None),
    );

    assert_eq!(
        engine.conversations[&conversation_id]
            .model_state
            .as_ref()
            .map(|models| models.current_model_id.as_str()),
        Some("old-model")
    );
}
