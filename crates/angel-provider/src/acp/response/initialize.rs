use super::*;

impl AcpAdapter {
    pub(super) fn decode_initialize_response(
        &self,
        mut output: TransportOutput,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        if !acp_protocol_version_is_supported(result) {
            return Ok(output
                .event(EngineEvent::RuntimeFaulted {
                    error: ErrorInfo::new(
                        "acp.unsupported_protocol_version",
                        format!(
                            "unsupported ACP protocol version {}",
                            result
                                .get("protocolVersion")
                                .map(acp_value_label)
                                .unwrap_or_else(|| "missing".to_string())
                        ),
                    ),
                })
                .log(TransportLogKind::Error, "unsupported ACP protocol version"));
        }
        let auth_methods = result
            .get("authMethods")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let runtime_authentication = &self.capabilities.runtime.authentication;
        if auth_methods.is_empty() || !runtime_authentication.is_supported() {
            self.clear_auth_negotiation_result();
            let authentication = if runtime_authentication.is_supported() {
                angel_engine::CapabilitySupport::Unknown
            } else {
                runtime_authentication.clone()
            };
            output = output
                .event(EngineEvent::RuntimeNegotiated {
                    capabilities: acp_runtime_capabilities(result, authentication),
                    conversation_capabilities: Some(acp_conversation_capabilities(
                        result,
                        self.capabilities(),
                    )),
                })
                .log(TransportLogKind::State, "ACP runtime initialized");
        } else {
            self.remember_auth_negotiation_result(result);
            output = output.event(EngineEvent::RuntimeAuthRequired {
                methods: auth_methods
                    .iter()
                    .filter_map(|method| {
                        let id = method.get("id").and_then(Value::as_str)?;
                        Some(angel_engine::AuthMethod {
                            id: angel_engine::AuthMethodId::new(id.to_string()),
                            label: method
                                .get("name")
                                .or_else(|| method.get("label"))
                                .and_then(Value::as_str)
                                .unwrap_or(id)
                                .to_string(),
                        })
                    })
                    .collect(),
            });
        }
        Ok(output)
    }

    pub(super) fn decode_authenticate_response(
        &self,
        mut output: TransportOutput,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let negotiation_result = self.auth_negotiation_result(result);
        self.clear_auth_negotiation_result();
        output = output
            .event(EngineEvent::RuntimeNegotiated {
                capabilities: acp_runtime_capabilities(
                    &negotiation_result,
                    angel_engine::CapabilitySupport::Supported,
                ),
                conversation_capabilities: Some(acp_conversation_capabilities(
                    &negotiation_result,
                    self.capabilities(),
                )),
            })
            .log(TransportLogKind::State, "ACP authentication accepted");
        Ok(output)
    }
}

impl AcpAdapter {
    fn remember_auth_negotiation_result(&self, result: &Value) {
        if let Ok(mut stored) = self.auth_negotiation_result.lock() {
            *stored = Some(result.clone());
        }
    }

    fn clear_auth_negotiation_result(&self) {
        if let Ok(mut stored) = self.auth_negotiation_result.lock() {
            *stored = None;
        }
    }

    fn auth_negotiation_result(&self, result: &Value) -> Value {
        if acp_response_has_negotiation_data(result) {
            return result.clone();
        }
        self.auth_negotiation_result
            .lock()
            .ok()
            .and_then(|stored| stored.clone())
            .unwrap_or_else(|| result.clone())
    }
}

fn acp_response_has_negotiation_data(result: &Value) -> bool {
    result.get("agentCapabilities").is_some()
        || result.get("agentInfo").is_some()
        || result.get("protocolVersion").is_some()
}

fn acp_runtime_capabilities(
    result: &Value,
    authentication: angel_engine::CapabilitySupport,
) -> angel_engine::RuntimeCapabilities {
    let mut capabilities = angel_engine::RuntimeCapabilities {
        name: result
            .get("agentInfo")
            .and_then(|agent| agent.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("acp")
            .to_string(),
        version: result
            .get("agentInfo")
            .and_then(|agent| agent.get("version"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| result.get("protocolVersion").map(acp_value_label)),
        discovery: acp_session_capability(result, "list"),
        authentication,
        metadata: Default::default(),
    };
    if let Some(title) = result
        .get("agentInfo")
        .and_then(|agent| agent.get("title"))
        .and_then(Value::as_str)
    {
        capabilities
            .metadata
            .insert("acp.agentInfo.title".to_string(), title.to_string());
    }
    if let Some(version) = result.get("protocolVersion").map(acp_value_label) {
        capabilities
            .metadata
            .insert("acp.protocolVersion".to_string(), version);
    }
    for (key, value) in [
        (
            "acp.promptCapabilities",
            result
                .get("agentCapabilities")
                .and_then(|capabilities| capabilities.get("promptCapabilities")),
        ),
        (
            "acp.mcpCapabilities",
            result
                .get("agentCapabilities")
                .and_then(|capabilities| capabilities.get("mcpCapabilities")),
        ),
        (
            "acp.sessionCapabilities",
            result
                .get("agentCapabilities")
                .and_then(|capabilities| capabilities.get("sessionCapabilities")),
        ),
    ] {
        if let Some(value) = value {
            capabilities
                .metadata
                .insert(key.to_string(), compact_json(value));
        }
    }
    capabilities
}

fn acp_protocol_version_is_supported(result: &Value) -> bool {
    match result.get("protocolVersion") {
        Some(Value::Number(number)) => number.as_u64() == Some(1),
        Some(Value::String(version)) => version == "1",
        Some(_) => false,
        None => true,
    }
}

fn acp_value_label(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn compact_json(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}

fn acp_conversation_capabilities(
    result: &Value,
    mut capabilities: angel_engine::ConversationCapabilities,
) -> angel_engine::ConversationCapabilities {
    capabilities.lifecycle.list = acp_session_capability(result, "list");
    capabilities.lifecycle.load = if result
        .get("agentCapabilities")
        .and_then(|capabilities| capabilities.get("loadSession"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        angel_engine::CapabilitySupport::Supported
    } else {
        angel_engine::CapabilitySupport::Unsupported
    };
    capabilities.history.hydrate = capabilities.lifecycle.load.clone();
    capabilities.lifecycle.resume = acp_session_capability(result, "resume");
    capabilities.lifecycle.fork = acp_session_capability(result, "fork");
    capabilities.lifecycle.close = acp_session_capability(result, "close");
    capabilities.context.additional_directories =
        acp_session_capability(result, "additionalDirectories");
    capabilities
}

fn acp_session_capability(result: &Value, name: &str) -> angel_engine::CapabilitySupport {
    if result
        .get("agentCapabilities")
        .and_then(|capabilities| capabilities.get("sessionCapabilities"))
        .and_then(|capabilities| capabilities.get(name))
        .is_some()
    {
        angel_engine::CapabilitySupport::Supported
    } else {
        angel_engine::CapabilitySupport::Unsupported
    }
}
