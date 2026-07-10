use super::super::*;

pub(super) fn initialize_params(adapter: &AcpAdapter, options: &TransportOptions) -> Value {
    let mut client_capabilities = serde_json::Map::new();
    if adapter.capabilities.runtime.authentication.is_supported() {
        client_capabilities.insert(
            "auth".to_string(),
            json!({
                "terminal": true,
            }),
        );
    }
    if options.experimental_api {
        client_capabilities.insert(
            "elicitation".to_string(),
            json!({
                "form": {},
                "url": {},
            }),
        );
    }
    json!({
        "protocolVersion": 1,
        "clientCapabilities": client_capabilities,
        "clientInfo": client_info_json(&options.client_info),
    })
}

pub(super) fn authenticate_params(effect: &angel_engine::ProtocolEffect) -> Value {
    json!({
        "methodId": effect
            .payload
            .fields
            .get("methodId")
            .or_else(|| effect.payload.fields.get("method"))
            .cloned()
            .unwrap_or_default(),
    })
}
