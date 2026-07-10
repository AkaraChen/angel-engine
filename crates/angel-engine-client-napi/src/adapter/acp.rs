use std::time::Instant;

use angel_provider::acp::AcpAdapter as EngineAcpAdapter;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::Value;

use super::codec::to_json;
use crate::{json_shape, napi_trace};

#[napi(js_name = "AcpAdapter")]
pub struct AcpAdapter {
    pub(super) adapter: EngineAcpAdapter,
}

#[napi]
impl AcpAdapter {
    #[napi(
        constructor,
        ts_args_type = "options?: { needAuthentication?: boolean } | null"
    )]
    pub fn new(options: Option<Value>) -> Result<Self> {
        let started = Instant::now();
        let need_authentication = options
            .as_ref()
            .and_then(|value| value.get("needAuthentication"))
            .and_then(Value::as_bool)
            .unwrap_or(true);
        napi_trace(format!(
            "AcpAdapter.new start need_authentication={need_authentication} options={}",
            match options.as_ref() {
                Some(options) => json_shape(options),
                None => "<none>".to_string(),
            }
        ));
        let adapter = if need_authentication {
            EngineAcpAdapter::standard()
        } else {
            EngineAcpAdapter::without_authentication()
        };
        napi_trace(format!(
            "AcpAdapter.new ok elapsed_ms={}",
            started.elapsed().as_millis()
        ));
        Ok(Self { adapter })
    }

    #[napi(js_name = "_angelNativeAdapterKind")]
    pub fn native_adapter_kind(&self) -> String {
        napi_trace("AcpAdapter._angelNativeAdapterKind called");
        "acp".to_string()
    }

    #[napi(js_name = "_angelNativeAcpNeedAuthentication")]
    pub fn native_acp_need_authentication(&self) -> bool {
        napi_trace("AcpAdapter._angelNativeAcpNeedAuthentication called");
        self.adapter
            .adapter_capabilities()
            .runtime
            .authentication
            .is_supported()
    }

    #[napi(js_name = "protocolFlavor", ts_return_type = "`${ClientProtocol}`")]
    pub fn protocol_flavor(&self) -> String {
        napi_trace("AcpAdapter.protocolFlavor called");
        "acp".to_string()
    }

    #[napi(ts_return_type = "unknown")]
    pub fn capabilities(&self) -> Result<Value> {
        napi_trace("AcpAdapter.capabilities called");
        to_json(self.adapter.capabilities())
    }

    #[napi(
        js_name = "encodeEffect",
        ts_args_type = "input: AdapterEncodeInput",
        ts_return_type = "TransportOutput"
    )]
    pub fn encode_effect(&self, input: Value) -> Result<Value> {
        napi_trace(format!(
            "AcpAdapter.encodeEffect called input={}",
            json_shape(&input)
        ));
        input
            .get("baseOutput")
            .cloned()
            .ok_or_else(|| Error::from_reason("AcpAdapter.encodeEffect needs native base output"))
    }

    #[napi(
        js_name = "decodeMessage",
        ts_args_type = "input: AdapterDecodeInput",
        ts_return_type = "TransportOutput"
    )]
    pub fn decode_message(&self, input: Value) -> Result<Value> {
        napi_trace(format!(
            "AcpAdapter.decodeMessage called input={}",
            json_shape(&input)
        ));
        input
            .get("baseOutput")
            .cloned()
            .ok_or_else(|| Error::from_reason("AcpAdapter.decodeMessage needs native base output"))
    }

    #[napi(
        js_name = "modelCatalogFromRuntimeDebug",
        ts_args_type = "result: unknown, currentModelId?: string | null",
        ts_return_type = "unknown | null"
    )]
    pub fn model_catalog_from_runtime_debug(
        &self,
        result: Value,
        current_model_id: Option<String>,
    ) -> Option<Value> {
        napi_trace(format!(
            "AcpAdapter.modelCatalogFromRuntimeDebug called result={} current_model_id={}",
            json_shape(&result),
            current_model_id.as_deref().unwrap_or("<none>")
        ));
        None
    }
}
