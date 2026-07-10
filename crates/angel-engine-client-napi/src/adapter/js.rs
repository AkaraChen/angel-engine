use std::{fmt, time::Instant};

use angel_engine::{
    AngelEngine, ConversationCapabilities, ConversationId, JsonRpcMessage, ProtocolEffect,
    ProtocolFlavor, SessionModelState, TransportOptions, TransportOutput, UserInput, method_name,
};
use angel_engine_client::ClientOptions as EngineClientOptions;
use angel_provider::{InterpretedUserInput, ProtocolAdapter as EngineProtocolAdapter};
use napi::JsValue;
use napi::bindgen_prelude::*;
use serde_json::Value;

use super::EngineResult;
use super::codec::{
    decode_input, encode_input, invalid_command, protocol_flavor_name, transport_output_from_json,
    transport_output_to_json,
};
use super::native_base::{
    NativeBaseAdapter, capabilities_from_js, method_is_overridden_before_native_base,
    native_acp_adapter, native_base_adapter_from_js, protocol_flavor_from_js,
};
use super::trace::trace_transport_output_result;
use crate::{json_shape, napi_trace, trace_napi_result};

pub(crate) struct JsProtocolAdapter {
    env: Env,
    object: Option<ObjectRef<false>>,
    flavor: ProtocolFlavor,
    capabilities: ConversationCapabilities,
    native_base: Option<NativeBaseAdapter>,
}

impl JsProtocolAdapter {
    pub(super) fn new(options: &EngineClientOptions, adapter: Object<'_>) -> Result<Self> {
        let started = Instant::now();
        napi_trace(format!(
            "JsProtocolAdapter.new start protocol={:?}",
            options.protocol
        ));
        let env = Env::from(adapter.value().env);
        let native_base = native_acp_adapter(&adapter)
            .map(NativeBaseAdapter::Acp)
            .or_else(|| native_base_adapter_from_js(&adapter).ok().flatten());
        let flavor = protocol_flavor_from_js(&adapter, native_base.as_ref(), options)?;
        let capabilities = capabilities_from_js(&adapter, native_base.as_ref(), flavor)?;
        let result = Ok(Self {
            env,
            object: Some(adapter.create_ref::<false>()?),
            flavor,
            capabilities,
            native_base,
        });
        trace_napi_result("JsProtocolAdapter.new", started, &result);
        result
    }

    fn call_transport_method(
        &self,
        method: &str,
        mut input: Value,
    ) -> EngineResult<TransportOutput> {
        let started = Instant::now();
        napi_trace(format!(
            "JsProtocolAdapter.{method} start input={}",
            json_shape(&input)
        ));
        let object = self.object_value()?;
        let object_ref = self.object_ref()?;
        let function: Function<'_, Value, Value> =
            object.get_named_property(method).map_err(|error| {
                invalid_command(format!("adapter.{method} is not callable: {error}"))
            })?;
        let output = function
            .apply(object_ref, input.take())
            .map_err(|error| invalid_command(format!("adapter.{method} threw: {error}")))?;
        let result = transport_output_from_json(output);
        trace_transport_output_result(&format!("JsProtocolAdapter.{method}"), started, &result);
        result
    }

    fn object_value(&self) -> EngineResult<Object<'_>> {
        self.object_ref()?
            .get_value(&self.env)
            .map_err(|error| invalid_command(format!("adapter object is unavailable: {error}")))
    }

    fn object_ref(&self) -> EngineResult<&ObjectRef<false>> {
        self.object
            .as_ref()
            .ok_or_else(|| invalid_command("adapter object reference was already released"))
    }

    fn method_is_overridden(&self, method: &str) -> bool {
        let Some(object_ref) = self.object.as_ref() else {
            return true;
        };
        let Ok(object) = object_ref.get_value(&self.env) else {
            return true;
        };
        method_is_overridden_before_native_base(&object, method).unwrap_or(true)
    }
}

impl fmt::Debug for JsProtocolAdapter {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("JsProtocolAdapter")
            .field("flavor", &self.flavor)
            .field("capabilities", &self.capabilities)
            .field("native_base", &self.native_base)
            .finish_non_exhaustive()
    }
}

impl Drop for JsProtocolAdapter {
    fn drop(&mut self) {
        napi_trace(format!(
            "JsProtocolAdapter.drop flavor={} native_base={}",
            protocol_flavor_name(self.flavor),
            self.native_base
                .as_ref()
                .map(NativeBaseAdapter::kind_name)
                .unwrap_or("<none>")
        ));
        if let Some(object) = self.object.take() {
            let _ = object.unref(&self.env);
        }
    }
}

impl EngineProtocolAdapter for JsProtocolAdapter {
    fn protocol_flavor(&self) -> ProtocolFlavor {
        self.flavor
    }

    fn capabilities(&self) -> ConversationCapabilities {
        self.capabilities.clone()
    }

    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> EngineResult<TransportOutput> {
        napi_trace(format!(
            "JsProtocolAdapter.encode_effect dispatch method={} native_base={} overridden={}",
            method_name(&effect.method),
            self.native_base
                .as_ref()
                .map(NativeBaseAdapter::kind_name)
                .unwrap_or("<none>"),
            self.method_is_overridden("encodeEffect")
        ));
        if let Some(base) = &self.native_base
            && !self.method_is_overridden("encodeEffect")
        {
            return base.encode_effect(engine, effect, options);
        }

        let mut input = encode_input(engine, effect, options)?;
        if let Some(base) = &self.native_base {
            input["baseOutput"] =
                transport_output_to_json(base.encode_effect(engine, effect, options)?)
                    .map_err(|error| invalid_command(error.to_string()))?;
        }
        self.call_transport_method("encodeEffect", input)
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> EngineResult<TransportOutput> {
        napi_trace(format!(
            "JsProtocolAdapter.decode_message dispatch message={} native_base={} overridden={}",
            json_shape(&message.to_value()),
            self.native_base
                .as_ref()
                .map(NativeBaseAdapter::kind_name)
                .unwrap_or("<none>"),
            self.method_is_overridden("decodeMessage")
        ));
        if let Some(base) = &self.native_base
            && !self.method_is_overridden("decodeMessage")
        {
            return base.decode_message(engine, message);
        }

        let mut input = decode_input(engine, message)?;
        if let Some(base) = &self.native_base {
            input["baseOutput"] = transport_output_to_json(base.decode_message(engine, message)?)
                .map_err(|error| invalid_command(error.to_string()))?;
        }
        self.call_transport_method("decodeMessage", input)
    }

    fn model_catalog_from_runtime_debug(
        &self,
        result: &Value,
        current_model_id: Option<&str>,
    ) -> Option<SessionModelState> {
        let started = Instant::now();
        napi_trace(format!(
            "JsProtocolAdapter.model_catalog_from_runtime_debug start result={} current_model_id={}",
            json_shape(result),
            current_model_id.unwrap_or("<none>")
        ));
        let object_ref = self.object.as_ref()?;
        let object = object_ref.get_value(&self.env).ok()?;
        let function: Function<'_, FnArgs<(Value, Option<String>)>, Value> = object
            .get_named_property("modelCatalogFromRuntimeDebug")
            .ok()?;
        let value = function
            .apply(
                object_ref,
                FnArgs::from((result.clone(), current_model_id.map(str::to_string))),
            )
            .ok()?;
        if value.is_null() {
            napi_trace(format!(
                "JsProtocolAdapter.model_catalog_from_runtime_debug ok elapsed_ms={} returned=null",
                started.elapsed().as_millis()
            ));
            return None;
        }
        let parsed = serde_json::from_value(value).ok();
        napi_trace(format!(
            "JsProtocolAdapter.model_catalog_from_runtime_debug ok elapsed_ms={} returned={}",
            started.elapsed().as_millis(),
            if parsed.is_some() {
                "catalog"
            } else {
                "invalid"
            }
        ));
        parsed
    }

    fn interpret_user_input(
        &self,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        input: &[UserInput],
    ) -> EngineResult<Option<InterpretedUserInput>> {
        napi_trace(format!(
            "JsProtocolAdapter.interpret_user_input dispatch conversation_id={} input_len={} native_base={} overridden={}",
            conversation_id,
            input.len(),
            self.native_base
                .as_ref()
                .map(NativeBaseAdapter::kind_name)
                .unwrap_or("<none>"),
            self.method_is_overridden("interpretUserInput")
        ));
        if let Some(base) = &self.native_base
            && !self.method_is_overridden("interpretUserInput")
        {
            return base.interpret_user_input(engine, conversation_id, input);
        }
        Ok(None)
    }
}
