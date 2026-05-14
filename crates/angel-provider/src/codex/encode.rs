use super::commands::{SERVICE_TIER_CONTEXT_KEY, SERVICE_TIER_NONE};
use super::ids::*;
use super::protocol_helpers::*;
use super::*;

impl CodexAdapter {
    pub(super) fn encode_params(
        &self,
        engine: &AngelEngine,
        effect: &angel_engine::ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<Value, angel_engine::EngineError> {
        match &effect.method {
            ProtocolMethod::Initialize => Ok(json!({
                "clientInfo": client_info_json(&options.client_info),
                "capabilities": {
                    "experimentalApi": options.experimental_api,
                },
            })),
            ProtocolMethod::StartConversation => {
                let mut params = serde_json::Map::new();
                if let Some(cwd) = effect.payload.fields.get("cwd") {
                    params.insert("cwd".to_string(), json!(cwd));
                }
                insert_codex_thread_overrides(engine, effect, &mut params)?;
                params.insert("experimentalRawEvents".to_string(), json!(true));
                params.insert("persistExtendedHistory".to_string(), json!(true));
                Ok(Value::Object(params))
            }
            ProtocolMethod::ResumeConversation => {
                let mut params = serde_json::Map::new();
                params.insert(
                    "threadId".to_string(),
                    json!(
                        effect
                            .payload
                            .fields
                            .get("remoteConversationId")
                            .or_else(|| effect.payload.fields.get("threadId"))
                            .cloned()
                            .unwrap_or_default()
                    ),
                );
                if effect
                    .payload
                    .fields
                    .get("hydrate")
                    .is_some_and(|hydrate| hydrate == "false")
                {
                    params.insert("excludeTurns".to_string(), json!(true));
                }
                params.insert("persistExtendedHistory".to_string(), json!(true));
                Ok(Value::Object(params))
            }
            ProtocolMethod::ForkConversation => Ok(json!({
                "threadId": codex_source_thread_id(engine, effect)?,
            })),
            ProtocolMethod::ArchiveConversation
            | ProtocolMethod::UnarchiveConversation
            | ProtocolMethod::Unsubscribe
            | ProtocolMethod::CompactHistory => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
            })),
            ProtocolMethod::RollbackHistory => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "numTurns": effect.payload.fields.get("numTurns").and_then(|value| value.parse::<usize>().ok()).unwrap_or(1),
            })),
            ProtocolMethod::InjectHistoryItems => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "items": [],
            })),
            ProtocolMethod::StartTurn => {
                let mut params = serde_json::Map::new();
                params.insert(
                    "threadId".to_string(),
                    json!(codex_thread_id(engine, effect)?),
                );
                params.insert("input".to_string(), codex_user_input(effect));
                insert_codex_overrides(engine, effect, &mut params)?;
                Ok(Value::Object(params))
            }
            ProtocolMethod::SteerTurn => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "input": codex_user_input(effect),
                "expectedTurnId": codex_turn_id(engine, effect)?,
            })),
            ProtocolMethod::CancelTurn => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "turnId": codex_turn_id(engine, effect)?,
            })),
            ProtocolMethod::RunShellCommand => Ok(json!({
                "threadId": codex_thread_id(engine, effect)?,
                "command": effect.payload.fields.get("command").cloned().unwrap_or_default(),
            })),
            ProtocolMethod::ListConversations => {
                let mut params = serde_json::Map::new();
                if let Some(cwd) = effect.payload.fields.get("cwd") {
                    params.insert("cwd".to_string(), json!(cwd));
                }
                if let Some(cursor) = effect.payload.fields.get("cursor") {
                    params.insert("cursor".to_string(), json!(cursor));
                }
                Ok(Value::Object(params))
            }
            ProtocolMethod::ResolveElicitation => Err(angel_engine::EngineError::InvalidCommand {
                message: "server request responses are encoded by encode_server_request_response"
                    .to_string(),
            }),
            _ => Ok(Value::Object(
                effect
                    .payload
                    .fields
                    .iter()
                    .map(|(key, value)| (key.clone(), json!(value)))
                    .collect(),
            )),
        }
    }

    pub(super) fn encode_server_request_response(
        &self,
        engine: &AngelEngine,
        effect: &angel_engine::ProtocolEffect,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let conversation_id = effect.conversation_id.clone().ok_or_else(|| {
            angel_engine::EngineError::InvalidCommand {
                message: "missing conversation id for elicitation response".to_string(),
            }
        })?;
        let elicitation_id = ElicitationId::new(
            effect
                .payload
                .fields
                .get("elicitationId")
                .cloned()
                .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                    message: "missing elicitation id".to_string(),
                })?,
        );
        let conversation = engine.conversations.get(&conversation_id).ok_or_else(|| {
            angel_engine::EngineError::ConversationNotFound {
                conversation_id: conversation_id.to_string(),
            }
        })?;
        let elicitation = conversation
            .elicitations
            .get(&elicitation_id)
            .ok_or_else(|| angel_engine::EngineError::ElicitationNotFound {
                elicitation_id: elicitation_id.to_string(),
            })?;
        let remote_request_id = match &elicitation.remote_request_id {
            RemoteRequestId::JsonRpc(id) => id.clone(),
            other => {
                return Err(angel_engine::EngineError::InvalidState {
                    expected: "Codex server request id".to_string(),
                    actual: format!("{other:?}"),
                });
            }
        };
        let decision = effect
            .payload
            .fields
            .get("decision")
            .map(String::as_str)
            .unwrap_or("Cancel");
        let result = codex_elicitation_response(elicitation, &effect.payload.fields);
        let mut output = TransportOutput::default()
            .message(JsonRpcMessage::response(remote_request_id, result))
            .event(EngineEvent::ElicitationResolved {
                conversation_id,
                elicitation_id,
                decision: angel_engine::ElicitationDecision::Raw(decision.to_string()),
            })
            .log(TransportLogKind::Send, "answered Codex server request");
        if let Some(request_id) = &effect.request_id {
            output.completed_requests.push(request_id.clone());
        }
        Ok(output)
    }
}

fn insert_codex_overrides(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
    params: &mut serde_json::Map<String, Value>,
) -> Result<(), angel_engine::EngineError> {
    let Some(context) = codex_effect_context(engine, effect)? else {
        params.insert("summary".to_string(), json!("auto"));
        return Ok(());
    };

    if let Some(model) = codex_context_model(context) {
        params.insert("model".to_string(), json!(model));
    }
    if let Some(effort) = codex_context_effort(context) {
        params.insert("effort".to_string(), json!(codex_reasoning_effort(effort)));
    }
    if let Some(service_tier) = codex_context_service_tier(context) {
        params.insert(
            "serviceTier".to_string(),
            codex_service_tier_value(service_tier),
        );
    }
    params.insert("summary".to_string(), json!("auto"));
    if let Some(policy) = codex_context_permission_mode(context) {
        params.insert("approvalPolicy".to_string(), json!(policy.id()));
    }
    let has_permissions = insert_codex_permissions(context, params);
    if !has_permissions
        && let Some(policy) = context
            .sandbox
            .effective()
            .and_then(|sandbox| sandbox_policy(codex_sandbox_policy(sandbox)))
    {
        params.insert("sandboxPolicy".to_string(), policy);
    }
    if let (Some(mode), Some(model)) = (
        codex_context_mode(context),
        codex_context_model(context).or_else(|| codex_current_model(engine, effect)),
    ) {
        params.insert(
            "collaborationMode".to_string(),
            json!({
                "mode": mode.id(),
                "settings": {
                    "model": model,
                    "developer_instructions": null,
                    "reasoning_effort": codex_context_effort(context)
                        .map(|effort| codex_reasoning_effort(effort)),
                }
            }),
        );
    }
    Ok(())
}

fn codex_current_model<'a>(
    engine: &'a AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Option<&'a str> {
    let conversation_id = effect.conversation_id.as_ref()?;
    let conversation = engine.conversations.get(conversation_id)?;
    conversation
        .context
        .model
        .effective()
        .and_then(Option::as_deref)
        .or_else(|| {
            conversation
                .model_state
                .as_ref()
                .map(|models| models.current_model_id.as_str())
        })
}

fn codex_source_thread_id(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<String, angel_engine::EngineError> {
    let source_id = effect
        .payload
        .fields
        .get("sourceConversationId")
        .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
            message: "missing source conversation id for Codex fork".to_string(),
        })?;
    let source = engine
        .conversations
        .get(&ConversationId::new(source_id.clone()))
        .ok_or_else(|| angel_engine::EngineError::ConversationNotFound {
            conversation_id: source_id.clone(),
        })?;
    source
        .remote
        .as_protocol_id()
        .map(str::to_string)
        .ok_or_else(|| angel_engine::EngineError::InvalidState {
            expected: "source Codex thread id".to_string(),
            actual: format!("{:?}", source.remote),
        })
}

fn codex_effect_context<'a>(
    engine: &'a AngelEngine,
    effect: &angel_engine::ProtocolEffect,
) -> Result<Option<&'a angel_engine::EffectiveContext>, angel_engine::EngineError> {
    let Some(conversation_id) = effect.conversation_id.as_ref() else {
        return Ok(None);
    };
    let conversation = engine.conversations.get(conversation_id).ok_or_else(|| {
        angel_engine::EngineError::ConversationNotFound {
            conversation_id: conversation_id.to_string(),
        }
    })?;
    Ok(Some(&conversation.context))
}

fn codex_context_model(context: &angel_engine::EffectiveContext) -> Option<&str> {
    context.model.effective().and_then(Option::as_deref)
}

fn codex_context_effort(context: &angel_engine::EffectiveContext) -> Option<&str> {
    context
        .reasoning
        .effective()
        .and_then(Option::as_ref)
        .and_then(|reasoning| reasoning.effort.as_deref())
}

fn codex_context_mode(context: &angel_engine::EffectiveContext) -> Option<CodexCollaborationMode> {
    context
        .mode
        .effective()
        .and_then(Option::as_ref)
        .and_then(|mode| CodexCollaborationMode::from_id(&mode.id))
}

fn codex_context_permission_mode(
    context: &angel_engine::EffectiveContext,
) -> Option<CodexPermissionMode> {
    context
        .permission_mode
        .effective()
        .and_then(Option::as_ref)
        .and_then(|mode| CodexPermissionMode::from_id(&mode.id))
        .or_else(|| {
            context
                .approvals
                .effective()
                .map(CodexPermissionMode::from_approval_policy)
        })
}

fn codex_context_service_tier(context: &angel_engine::EffectiveContext) -> Option<&str> {
    context
        .raw
        .get(SERVICE_TIER_CONTEXT_KEY)?
        .effective()
        .map(String::as_str)
}

fn codex_reasoning_effort(effort: &str) -> &str {
    if effort == "high" { "xhigh" } else { effort }
}

fn codex_sandbox_policy(sandbox: &angel_engine::SandboxProfile) -> &str {
    match sandbox {
        angel_engine::SandboxProfile::ReadOnly => "read-only",
        angel_engine::SandboxProfile::WorkspaceWrite => "workspace-write",
        angel_engine::SandboxProfile::FullAccess => "danger-full-access",
        angel_engine::SandboxProfile::Custom(value) => value,
    }
}

fn codex_service_tier_value(service_tier: &str) -> Value {
    if service_tier == SERVICE_TIER_NONE {
        Value::Null
    } else {
        json!(service_tier)
    }
}

fn insert_codex_thread_overrides(
    engine: &AngelEngine,
    effect: &angel_engine::ProtocolEffect,
    params: &mut serde_json::Map<String, Value>,
) -> Result<(), angel_engine::EngineError> {
    let Some(context) = codex_effect_context(engine, effect)? else {
        return Ok(());
    };
    if let Some(model) = codex_context_model(context) {
        params.insert("model".to_string(), json!(model));
    }
    if let Some(effort) = codex_context_effort(context) {
        params.insert("effort".to_string(), json!(codex_reasoning_effort(effort)));
    }
    if let Some(service_tier) = codex_context_service_tier(context) {
        params.insert(
            "serviceTier".to_string(),
            codex_service_tier_value(service_tier),
        );
    }
    if let Some(policy) = codex_context_permission_mode(context) {
        params.insert("approvalPolicy".to_string(), json!(policy.id()));
    }
    if !insert_codex_permissions(context, params)
        && let Some(sandbox) = context.sandbox.effective()
    {
        params.insert("sandbox".to_string(), json!(codex_sandbox_policy(sandbox)));
    }
    if let (Some(mode), Some(model)) = (codex_context_mode(context), codex_context_model(context)) {
        params.insert(
            "collaborationMode".to_string(),
            json!({
                "mode": mode.id(),
                "settings": {
                    "model": model,
                    "developer_instructions": null,
                    "reasoning_effort": codex_context_effort(context)
                        .map(|effort| codex_reasoning_effort(effort)),
                }
            }),
        );
    }
    Ok(())
}

fn insert_codex_permissions(
    context: &angel_engine::EffectiveContext,
    params: &mut serde_json::Map<String, Value>,
) -> bool {
    let Some(profile) = context.permissions.effective() else {
        return false;
    };
    params.insert(
        "permissions".to_string(),
        json!({
            "type": "profile",
            "id": profile.name.as_str(),
            "modifications": null,
        }),
    );
    true
}

fn sandbox_policy(policy: &str) -> Option<Value> {
    match policy {
        "read-only" | "readOnly" => Some(json!({ "type": "readOnly" })),
        "workspace-write" | "workspaceWrite" => Some(json!({ "type": "workspaceWrite" })),
        "danger-full-access" | "dangerFullAccess" | "full-access" => {
            Some(json!({ "type": "dangerFullAccess" }))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thread_list_encodes_common_discovery_params() {
        let adapter = CodexAdapter::app_server();
        let engine = AngelEngine::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            adapter.capabilities(),
        );
        let effect = angel_engine::ProtocolEffect::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            ProtocolMethod::ListConversations,
        )
        .field("cwd", "/tmp/project")
        .field("cursor", "opaque");

        let params = adapter
            .encode_params(&engine, &effect, &TransportOptions::default())
            .expect("thread list params");

        assert_eq!(params, json!({"cwd": "/tmp/project", "cursor": "opaque"}));
    }

    #[test]
    fn thread_start_enables_raw_response_events() {
        let adapter = CodexAdapter::app_server();
        let engine = AngelEngine::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            adapter.capabilities(),
        );
        let effect = angel_engine::ProtocolEffect::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            ProtocolMethod::StartConversation,
        )
        .field("cwd", "/tmp/project");

        let params = adapter
            .encode_params(&engine, &effect, &TransportOptions::default())
            .expect("thread start params");

        assert_eq!(
            params,
            json!({
                "cwd": "/tmp/project",
                "experimentalRawEvents": true,
                "persistExtendedHistory": true
            })
        );
    }

    #[test]
    fn turn_start_collaboration_mode_uses_current_model_state() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine
            .apply_event(EngineEvent::ConversationProvisionStarted {
                id: conversation_id.clone(),
                remote: RemoteConversationId::Known("thread".to_string()),
                op: angel_engine::ProvisionOp::New,
                capabilities: adapter.capabilities(),
            })
            .expect("conversation provision");
        engine
            .apply_event(EngineEvent::ConversationReady {
                id: conversation_id.clone(),
                remote: Some(RemoteConversationId::Known("thread".to_string())),
                context: ContextPatch::empty(),
                capabilities: None,
            })
            .expect("conversation ready");
        engine
            .apply_event(EngineEvent::SessionModelsUpdated {
                conversation_id: conversation_id.clone(),
                models: SessionModelState {
                    current_model_id: "gpt-5.5".to_string(),
                    available_models: vec![SessionModel {
                        id: "gpt-5.5".to_string(),
                        name: "GPT-5.5".to_string(),
                        description: None,
                    }],
                },
            })
            .expect("model state");
        engine
            .plan_command(angel_engine::EngineCommand::UpdateContext {
                conversation_id: conversation_id.clone(),
                patch: ContextPatch::one(angel_engine::ContextUpdate::Mode {
                    scope: angel_engine::ContextScope::TurnAndFuture,
                    mode: Some(angel_engine::AgentMode {
                        id: "plan".to_string(),
                    }),
                }),
            })
            .expect("set mode");

        let plan = engine
            .plan_command(angel_engine::EngineCommand::StartTurn {
                conversation_id,
                input: vec![angel_engine::UserInput::text("make a plan")],
                overrides: angel_engine::TurnOverrides::default(),
            })
            .expect("start turn");
        let params = adapter
            .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("turn start params");

        assert_eq!(params["collaborationMode"]["mode"], json!("plan"));
        assert_eq!(
            params["collaborationMode"]["settings"]["model"],
            json!("gpt-5.5")
        );
    }

    #[test]
    fn turn_start_keeps_collaboration_mode_and_permission_mode_independent() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine
            .apply_event(EngineEvent::ConversationProvisionStarted {
                id: conversation_id.clone(),
                remote: RemoteConversationId::Known("thread".to_string()),
                op: angel_engine::ProvisionOp::New,
                capabilities: adapter.capabilities(),
            })
            .expect("conversation provision");
        engine
            .apply_event(EngineEvent::ConversationReady {
                id: conversation_id.clone(),
                remote: Some(RemoteConversationId::Known("thread".to_string())),
                context: ContextPatch::empty(),
                capabilities: None,
            })
            .expect("conversation ready");
        engine
            .apply_event(EngineEvent::SessionModelsUpdated {
                conversation_id: conversation_id.clone(),
                models: SessionModelState {
                    current_model_id: "gpt-5.5".to_string(),
                    available_models: vec![SessionModel {
                        id: "gpt-5.5".to_string(),
                        name: "GPT-5.5".to_string(),
                        description: None,
                    }],
                },
            })
            .expect("model state");
        engine
            .apply_event(EngineEvent::SessionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: SessionModeState {
                    current_mode_id: "default".to_string(),
                    available_modes: vec![
                        SessionMode {
                            id: "default".to_string(),
                            name: "Default".to_string(),
                            description: None,
                        },
                        SessionMode {
                            id: "plan".to_string(),
                            name: "Plan".to_string(),
                            description: None,
                        },
                    ],
                },
            })
            .expect("mode state");
        engine
            .apply_event(EngineEvent::SessionPermissionModesUpdated {
                conversation_id: conversation_id.clone(),
                modes: SessionPermissionModeState {
                    current_mode_id: "on-request".to_string(),
                    available_modes: CodexPermissionMode::ALL
                        .into_iter()
                        .map(|mode| SessionPermissionMode {
                            id: mode.id().to_string(),
                            name: mode.name().to_string(),
                            description: mode.description().map(str::to_string),
                        })
                        .collect(),
                },
            })
            .expect("permission mode state");
        engine
            .set_mode(conversation_id.clone(), "plan")
            .expect("set mode");
        engine
            .set_permission_mode(conversation_id.clone(), "never")
            .expect("set permission mode");

        let plan = engine
            .plan_command(angel_engine::EngineCommand::StartTurn {
                conversation_id,
                input: vec![angel_engine::UserInput::text("make a plan")],
                overrides: angel_engine::TurnOverrides::default(),
            })
            .expect("start turn");
        let params = adapter
            .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("turn start params");

        assert_eq!(params["collaborationMode"]["mode"], json!("plan"));
        assert_eq!(params["approvalPolicy"], json!("never"));
    }

    #[test]
    fn turn_start_uses_context_service_tier() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine
            .apply_event(EngineEvent::ConversationProvisionStarted {
                id: conversation_id.clone(),
                remote: RemoteConversationId::Known("thread".to_string()),
                op: angel_engine::ProvisionOp::New,
                capabilities: adapter.capabilities(),
            })
            .expect("conversation provision");
        engine
            .apply_event(EngineEvent::ConversationReady {
                id: conversation_id.clone(),
                remote: Some(RemoteConversationId::Known("thread".to_string())),
                context: ContextPatch::empty(),
                capabilities: None,
            })
            .expect("conversation ready");
        engine
            .apply_event(EngineEvent::ContextUpdated {
                conversation_id: conversation_id.clone(),
                patch: ContextPatch::one(angel_engine::ContextUpdate::Raw {
                    scope: angel_engine::ContextScope::TurnAndFuture,
                    key: SERVICE_TIER_CONTEXT_KEY.to_string(),
                    value: crate::codex::commands::SERVICE_TIER_FAST.to_string(),
                }),
            })
            .expect("service tier context");

        let plan = engine
            .plan_command(angel_engine::EngineCommand::StartTurn {
                conversation_id,
                input: vec![angel_engine::UserInput::text("hello")],
                overrides: angel_engine::TurnOverrides::default(),
            })
            .expect("start turn");
        let params = adapter
            .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("turn start params");

        assert_eq!(params["serviceTier"], json!("priority"));
    }

    #[test]
    fn thread_resume_encodes_common_remote_conversation_id() {
        let adapter = CodexAdapter::app_server();
        let engine = AngelEngine::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            adapter.capabilities(),
        );
        let effect = angel_engine::ProtocolEffect::new(
            angel_engine::ProtocolFlavor::CodexAppServer,
            ProtocolMethod::ResumeConversation,
        )
        .field("remoteConversationId", "thread")
        .field("hydrate", "false");

        let params = adapter
            .encode_params(&engine, &effect, &TransportOptions::default())
            .expect("thread resume params");

        assert_eq!(
            params,
            json!({
                "threadId": "thread",
                "excludeTurns": true,
                "persistExtendedHistory": true
            })
        );
    }

    #[test]
    fn turn_start_encodes_structured_user_input_as_codex_dto() {
        let adapter = CodexAdapter::app_server();
        let mut engine = AngelEngine::with_available_runtime(
            angel_engine::ProtocolFlavor::CodexAppServer,
            angel_engine::RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine
            .apply_event(EngineEvent::ConversationProvisionStarted {
                id: conversation_id.clone(),
                remote: RemoteConversationId::Known("thread".to_string()),
                op: angel_engine::ProvisionOp::New,
                capabilities: adapter.capabilities(),
            })
            .expect("conversation provision");
        engine
            .apply_event(EngineEvent::ConversationReady {
                id: conversation_id.clone(),
                remote: Some(RemoteConversationId::Known("thread".to_string())),
                context: ContextPatch::empty(),
                capabilities: None,
            })
            .expect("conversation ready");
        let plan = engine
            .plan_command(angel_engine::EngineCommand::StartTurn {
                conversation_id,
                input: vec![
                    angel_engine::UserInput::text("describe this"),
                    angel_engine::UserInput::image(
                        "ZmFrZQ==",
                        "image/png",
                        Some("shot.png".to_string()),
                    ),
                    angel_engine::UserInput::resource_link(
                        "Project Notes.pdf",
                        "file:///repo/Project%20Notes.pdf",
                    ),
                    angel_engine::UserInput::file_mention(
                        "src/lib.rs",
                        "/repo/src/lib.rs",
                        Some("text/x-rust".to_string()),
                    ),
                    angel_engine::UserInput {
                        content: "file:///repo/shot.png".to_string(),
                        kind: angel_engine::UserInputKind::ResourceLink {
                            name: "shot.png".to_string(),
                            uri: "file:///repo/shot.png".to_string(),
                            mime_type: Some("image/png".to_string()),
                            title: None,
                            description: None,
                        },
                    },
                    angel_engine::UserInput::embedded_text_resource(
                        "attachment://notes.txt",
                        "hello from a file",
                        Some("text/plain".to_string()),
                    ),
                    angel_engine::UserInput::embedded_blob_resource(
                        "attachment://archive.zip",
                        "UEsDBAo=",
                        Some("application/zip".to_string()),
                        Some("archive.zip".to_string()),
                    ),
                ],
                overrides: angel_engine::TurnOverrides::default(),
            })
            .expect("start turn");

        let params = adapter
            .encode_params(&engine, &plan.effects[0], &TransportOptions::default())
            .expect("turn start params");

        assert_eq!(params["threadId"], json!("thread"));
        assert_eq!(
            params["input"],
            json!([
                {
                    "type": "text",
                    "text": "\n# Files mentioned by the user:\n\n## Project Notes.pdf: /repo/Project Notes.pdf\n\n## My request for Codex:\ndescribe this\n",
                    "text_elements": []
                },
                {"type": "image", "url": "data:image/png;base64,ZmFrZQ=="},
                {"type": "mention", "name": "src/lib.rs", "path": "/repo/src/lib.rs"},
                {"type": "localImage", "path": "/repo/shot.png"},
                {
                    "type": "text",
                    "text": "Attached text resource: attachment://notes.txt\nMIME type: text/plain\n\nhello from a file",
                    "text_elements": []
                },
                {
                    "type": "text",
                    "text": "Attached file: archive.zip\nURI: attachment://archive.zip\nMIME type: application/zip\nEncoding: base64\n\nUEsDBAo=",
                    "text_elements": []
                }
            ])
        );
    }
}
