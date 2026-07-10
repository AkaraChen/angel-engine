use super::*;

impl CodexAdapter {
    pub(super) fn decode_initialize_response(
        &self,
        mut output: TransportOutput,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        output = output
            .event(EngineEvent::RuntimeNegotiated {
                capabilities: angel_engine::RuntimeCapabilities {
                    name: "codex-app-server".to_string(),
                    version: result
                        .get("userAgent")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    discovery: angel_engine::CapabilitySupport::Supported,
                    authentication: angel_engine::CapabilitySupport::Unknown,
                    metadata: Default::default(),
                },
                conversation_capabilities: Some(self.capabilities()),
            })
            .message(JsonRpcMessage::notification("initialized", Value::Null))
            .log(TransportLogKind::State, "Codex runtime initialized");
        Ok(output)
    }
}
