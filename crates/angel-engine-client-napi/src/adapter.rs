use std::{fmt, time::Instant};

use angel_engine::{
    AngelEngine, ConversationCapabilities, ConversationId, EngineError, EngineEvent,
    JsonRpcMessage, JsonRpcRequestId, ProtocolEffect, ProtocolFlavor, SessionModelState,
    TransportLog, TransportLogKind, TransportOptions, TransportOutput, UserInput, method_name,
};
use angel_engine_client::{
    ClientOptions as EngineClientOptions, ClientProtocol as EngineClientProtocol,
    ClientSnapshot as EngineClientSnapshot, RuntimeAdapter as EngineRuntimeAdapter,
};
use angel_provider::acp::AcpAdapter as EngineAcpAdapter;
use angel_provider::{InterpretedUserInput, ProtocolAdapter as EngineProtocolAdapter};
use napi::JsValue;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::{Value, json};

use crate::{json_shape, napi_trace, trace_napi_result};

type EngineResult<T> = std::result::Result<T, EngineError>;

#[napi(js_name = "AcpAdapter")]
pub struct AcpAdapter {
    adapter: EngineAcpAdapter,
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

pub(crate) enum NapiRuntimeAdapter {
    Builtin(EngineRuntimeAdapter),
    Js(JsProtocolAdapter),
}

impl NapiRuntimeAdapter {
    pub(crate) fn new(options: &EngineClientOptions, adapter: Option<Object<'_>>) -> Result<Self> {
        let started = Instant::now();
        napi_trace(format!(
            "NapiRuntimeAdapter.new start protocol={:?} adapter_present={}",
            options.protocol,
            adapter.is_some()
        ));
        match adapter {
            Some(adapter) => {
                let result = JsProtocolAdapter::new(options, adapter).map(Self::Js);
                trace_napi_result("NapiRuntimeAdapter.new", started, &result);
                result
            }
            None => {
                let result = Ok(Self::Builtin(EngineRuntimeAdapter::from_options(options)));
                trace_napi_result("NapiRuntimeAdapter.new", started, &result);
                result
            }
        }
    }
}

impl fmt::Debug for NapiRuntimeAdapter {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Builtin(adapter) => formatter.debug_tuple("Builtin").field(adapter).finish(),
            Self::Js(adapter) => formatter.debug_tuple("Js").field(adapter).finish(),
        }
    }
}

impl EngineProtocolAdapter for NapiRuntimeAdapter {
    fn protocol_flavor(&self) -> ProtocolFlavor {
        napi_trace("NapiRuntimeAdapter.protocol_flavor called");
        match self {
            Self::Builtin(adapter) => adapter.protocol_flavor(),
            Self::Js(adapter) => adapter.protocol_flavor(),
        }
    }

    fn capabilities(&self) -> ConversationCapabilities {
        napi_trace("NapiRuntimeAdapter.capabilities called");
        match self {
            Self::Builtin(adapter) => adapter.capabilities(),
            Self::Js(adapter) => adapter.capabilities(),
        }
    }

    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> EngineResult<TransportOutput> {
        let started = Instant::now();
        napi_trace(format!(
            "NapiRuntimeAdapter.encode_effect start adapter_kind={} flavor={} method={} conversation_id={} turn_id={}",
            self.adapter_kind_name(),
            protocol_flavor_name(effect.flavor),
            method_name(&effect.method),
            match effect.conversation_id.as_ref() {
                Some(conversation_id) => conversation_id.to_string(),
                None => "<none>".to_string(),
            },
            match effect.turn_id.as_ref() {
                Some(turn_id) => turn_id.to_string(),
                None => "<none>".to_string(),
            }
        ));
        let result = match self {
            Self::Builtin(adapter) => adapter.encode_effect(engine, effect, options),
            Self::Js(adapter) => adapter.encode_effect(engine, effect, options),
        };
        trace_transport_output_result("NapiRuntimeAdapter.encode_effect", started, &result);
        result
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> EngineResult<TransportOutput> {
        let started = Instant::now();
        napi_trace(format!(
            "NapiRuntimeAdapter.decode_message start adapter_kind={} message={}",
            self.adapter_kind_name(),
            json_shape(&message.to_value())
        ));
        let result = match self {
            Self::Builtin(adapter) => adapter.decode_message(engine, message),
            Self::Js(adapter) => adapter.decode_message(engine, message),
        };
        trace_transport_output_result("NapiRuntimeAdapter.decode_message", started, &result);
        result
    }

    fn model_catalog_from_runtime_debug(
        &self,
        result: &Value,
        current_model_id: Option<&str>,
    ) -> Option<SessionModelState> {
        trace_optional_value(
            "NapiRuntimeAdapter.model_catalog_from_runtime_debug",
            format!(
                "adapter_kind={} result={} current_model_id={}",
                self.adapter_kind_name(),
                json_shape(result),
                current_model_id.unwrap_or("<none>")
            ),
            || match self {
                Self::Builtin(adapter) => {
                    adapter.model_catalog_from_runtime_debug(result, current_model_id)
                }
                Self::Js(adapter) => {
                    adapter.model_catalog_from_runtime_debug(result, current_model_id)
                }
            },
        )
    }

    fn interpret_user_input(
        &self,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        input: &[UserInput],
    ) -> EngineResult<Option<InterpretedUserInput>> {
        let started = Instant::now();
        napi_trace(format!(
            "NapiRuntimeAdapter.interpret_user_input start adapter_kind={} conversation_id={} input_len={}",
            self.adapter_kind_name(),
            conversation_id,
            input.len()
        ));
        let result = match self {
            Self::Builtin(adapter) => adapter.interpret_user_input(engine, conversation_id, input),
            Self::Js(adapter) => adapter.interpret_user_input(engine, conversation_id, input),
        };
        trace_engine_result("NapiRuntimeAdapter.interpret_user_input", started, &result);
        result
    }
}

impl NapiRuntimeAdapter {
    fn adapter_kind_name(&self) -> &'static str {
        match self {
            Self::Builtin(_) => "builtin",
            Self::Js(_) => "js",
        }
    }
}

pub(crate) struct JsProtocolAdapter {
    env: Env,
    object: Option<ObjectRef<false>>,
    flavor: ProtocolFlavor,
    capabilities: ConversationCapabilities,
    native_base: Option<NativeBaseAdapter>,
}

impl JsProtocolAdapter {
    fn new(options: &EngineClientOptions, adapter: Object<'_>) -> Result<Self> {
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

#[derive(Clone)]
enum NativeBaseAdapter {
    Acp(EngineAcpAdapter),
}

impl NativeBaseAdapter {
    fn kind_name(&self) -> &'static str {
        match self {
            Self::Acp(_) => "acp",
        }
    }

    fn protocol_flavor(&self) -> ProtocolFlavor {
        napi_trace(format!(
            "NativeBaseAdapter.protocol_flavor kind={}",
            self.kind_name()
        ));
        match self {
            Self::Acp(adapter) => adapter.protocol_flavor(),
        }
    }

    fn capabilities(&self) -> ConversationCapabilities {
        napi_trace(format!(
            "NativeBaseAdapter.capabilities kind={}",
            self.kind_name()
        ));
        match self {
            Self::Acp(adapter) => adapter.capabilities(),
        }
    }

    fn encode_effect(
        &self,
        engine: &AngelEngine,
        effect: &ProtocolEffect,
        options: &TransportOptions,
    ) -> EngineResult<TransportOutput> {
        let started = Instant::now();
        napi_trace(format!(
            "NativeBaseAdapter.encode_effect start kind={} method={}",
            self.kind_name(),
            method_name(&effect.method)
        ));
        let result = match self {
            Self::Acp(adapter) => adapter.encode_effect(engine, effect, options),
        };
        trace_transport_output_result("NativeBaseAdapter.encode_effect", started, &result);
        result
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> EngineResult<TransportOutput> {
        let started = Instant::now();
        napi_trace(format!(
            "NativeBaseAdapter.decode_message start kind={} message={}",
            self.kind_name(),
            json_shape(&message.to_value())
        ));
        let result = match self {
            Self::Acp(adapter) => adapter.decode_message(engine, message),
        };
        trace_transport_output_result("NativeBaseAdapter.decode_message", started, &result);
        result
    }

    fn interpret_user_input(
        &self,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        input: &[UserInput],
    ) -> EngineResult<Option<InterpretedUserInput>> {
        let started = Instant::now();
        napi_trace(format!(
            "NativeBaseAdapter.interpret_user_input start kind={} conversation_id={} input_len={}",
            self.kind_name(),
            conversation_id,
            input.len()
        ));
        let result = match self {
            Self::Acp(adapter) => adapter.interpret_user_input(engine, conversation_id, input),
        };
        trace_engine_result("NativeBaseAdapter.interpret_user_input", started, &result);
        result
    }
}

impl fmt::Debug for NativeBaseAdapter {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Acp(_) => formatter.write_str("Acp"),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum NativeBaseKind {
    Acp,
}

fn native_acp_adapter(adapter: &Object<'_>) -> Option<EngineAcpAdapter> {
    adapter
        .unwrap::<AcpAdapter>()
        .ok()
        .map(|adapter| adapter.adapter.clone())
}

fn native_base_adapter_from_js(adapter: &Object<'_>) -> Result<Option<NativeBaseAdapter>> {
    let Some(kind) = native_base_kind(adapter)? else {
        return Ok(None);
    };
    Ok(match kind {
        NativeBaseKind::Acp => Some(NativeBaseAdapter::Acp(js_acp_adapter(adapter)?)),
    })
}

fn js_acp_adapter(adapter: &Object<'_>) -> Result<EngineAcpAdapter> {
    let need_authentication = adapter
        .get::<Function<'_, (), bool>>("_angelNativeAcpNeedAuthentication")?
        .map(|function| function.apply(*adapter, ()))
        .transpose()?
        .unwrap_or(true);
    Ok(if need_authentication {
        EngineAcpAdapter::standard()
    } else {
        EngineAcpAdapter::without_authentication()
    })
}

fn native_base_kind(adapter: &Object<'_>) -> Result<Option<NativeBaseKind>> {
    let Some(function) = adapter.get::<Function<'_, (), String>>("_angelNativeAdapterKind")? else {
        return Ok(None);
    };
    Ok(match function.apply(*adapter, ())?.as_str() {
        "acp" => Some(NativeBaseKind::Acp),
        _ => None,
    })
}

fn method_is_overridden_before_native_base(adapter: &Object<'_>, method: &str) -> Result<bool> {
    if adapter.has_own_property(method)? {
        return Ok(true);
    }
    let mut current = prototype_object(*adapter)?;
    while let Some(object) = current {
        if object.has_own_property("_angelNativeAdapterKind")? {
            return Ok(false);
        }
        if object.has_own_property(method)? {
            return Ok(true);
        }
        current = prototype_object(object)?;
    }
    Ok(true)
}

fn prototype_object(object: Object<'_>) -> Result<Option<Object<'_>>> {
    let prototype = object.get_prototype()?;
    if prototype.get_type()? != ValueType::Object {
        return Ok(None);
    }
    unsafe { prototype.cast::<Object<'_>>().map(Some) }
}

fn protocol_flavor_from_js(
    adapter: &Object<'_>,
    native_base: Option<&NativeBaseAdapter>,
    options: &EngineClientOptions,
) -> Result<ProtocolFlavor> {
    if let Some(function) = adapter.get::<Function<'_, (), String>>("protocolFlavor")? {
        return parse_protocol_flavor(&function.apply(*adapter, ())?);
    }
    if let Some(base) = native_base {
        return Ok(base.protocol_flavor());
    }
    Ok(match options.protocol {
        EngineClientProtocol::Acp => ProtocolFlavor::Acp,
        EngineClientProtocol::Kimi => ProtocolFlavor::Acp,
        EngineClientProtocol::Gemini => ProtocolFlavor::Acp,
        EngineClientProtocol::Qoder => ProtocolFlavor::Acp,
        EngineClientProtocol::Copilot => ProtocolFlavor::Acp,
        EngineClientProtocol::Cursor => ProtocolFlavor::Acp,
        EngineClientProtocol::Cline => ProtocolFlavor::Acp,
        EngineClientProtocol::CodexAppServer => ProtocolFlavor::CodexAppServer,
        EngineClientProtocol::Custom => ProtocolFlavor::Custom,
    })
}

fn capabilities_from_js(
    adapter: &Object<'_>,
    native_base: Option<&NativeBaseAdapter>,
    flavor: ProtocolFlavor,
) -> Result<ConversationCapabilities> {
    if let Some(function) = adapter.get::<Function<'_, (), Value>>("capabilities")? {
        return from_json(function.apply(*adapter, ())?);
    }
    if let Some(base) = native_base {
        return Ok(base.capabilities());
    }
    Ok(match flavor {
        ProtocolFlavor::Acp => angel_provider::acp::acp_standard_capabilities(),
        ProtocolFlavor::CodexAppServer => angel_provider::codex::codex_app_server_capabilities(),
        ProtocolFlavor::Custom => ConversationCapabilities::unknown(),
    })
}

fn parse_protocol_flavor(value: &str) -> Result<ProtocolFlavor> {
    match value {
        "acp" => Ok(ProtocolFlavor::Acp),
        "codexAppServer" => Ok(ProtocolFlavor::CodexAppServer),
        "custom" => Ok(ProtocolFlavor::Custom),
        other => Err(Error::from_reason(format!(
            "unsupported adapter protocol flavor: {other}"
        ))),
    }
}

fn encode_input(
    engine: &AngelEngine,
    effect: &ProtocolEffect,
    options: &TransportOptions,
) -> EngineResult<Value> {
    Ok(json!({
        "engine": engine_snapshot(engine)?,
        "effect": protocol_effect_json(effect),
        "options": transport_options_json(options),
    }))
}

fn decode_input(engine: &AngelEngine, message: &JsonRpcMessage) -> EngineResult<Value> {
    Ok(json!({
        "engine": engine_snapshot(engine)?,
        "message": message.to_value(),
    }))
}

fn engine_snapshot(engine: &AngelEngine) -> EngineResult<Value> {
    serde_json::to_value(EngineClientSnapshot::from(engine))
        .map_err(|error| invalid_command(error.to_string()))
}

fn protocol_effect_json(effect: &ProtocolEffect) -> Value {
    json!({
        "flavor": protocol_flavor_name(effect.flavor),
        "method": method_name(&effect.method),
        "methodKind": effect.method,
        "requestId": effect.request_id.as_ref().map(JsonRpcRequestId::to_json_value),
        "conversationId": effect.conversation_id.as_ref().map(ToString::to_string),
        "turnId": effect.turn_id.as_ref().map(ToString::to_string),
        "payload": {
            "fields": effect.payload.fields,
        },
    })
}

fn transport_options_json(options: &TransportOptions) -> Value {
    json!({
        "clientInfo": {
            "name": options.client_info.name,
            "title": options.client_info.title,
            "version": options.client_info.version,
        },
        "experimentalApi": options.experimental_api,
    })
}

fn protocol_flavor_name(flavor: ProtocolFlavor) -> &'static str {
    match flavor {
        ProtocolFlavor::Acp => "acp",
        ProtocolFlavor::CodexAppServer => "codexAppServer",
        ProtocolFlavor::Custom => "custom",
    }
}

fn transport_output_to_json(output: TransportOutput) -> serde_json::Result<Value> {
    Ok(json!({
        "messages": output
            .messages
            .iter()
            .map(JsonRpcMessage::to_value)
            .collect::<Vec<_>>(),
        "events": serde_json::to_value(output.events)?,
        "completedRequests": output
            .completed_requests
            .iter()
            .map(JsonRpcRequestId::to_json_value)
            .collect::<Vec<_>>(),
        "logs": output
            .logs
            .iter()
            .map(transport_log_json)
            .collect::<Vec<_>>(),
    }))
}

fn transport_output_from_json(value: Value) -> EngineResult<TransportOutput> {
    let messages = required_array_field(&value, "messages")?
        .into_iter()
        .map(JsonRpcMessage::from_value)
        .collect::<EngineResult<Vec<_>>>()?;
    let events = serde_json::from_value::<Vec<EngineEvent>>(required_field(&value, "events")?)
        .map_err(|error| invalid_command(format!("invalid adapter events: {error}")))?;
    let completed_requests = required_array_field(&value, "completedRequests")?
        .into_iter()
        .map(|value| JsonRpcRequestId::from_json_value(&value))
        .collect();
    let logs = required_array_field(&value, "logs")?
        .into_iter()
        .map(transport_log_from_json)
        .collect::<EngineResult<Vec<_>>>()?;
    Ok(TransportOutput {
        messages,
        events,
        completed_requests,
        logs,
    })
}

fn required_field(value: &Value, field: &str) -> EngineResult<Value> {
    value
        .get(field)
        .cloned()
        .ok_or_else(|| invalid_command(format!("adapter output is missing {field}")))
}

fn required_array_field(value: &Value, field: &str) -> EngineResult<Vec<Value>> {
    required_field(value, field)?
        .as_array()
        .cloned()
        .ok_or_else(|| invalid_command(format!("adapter output {field} must be an array")))
}

fn transport_log_json(log: &TransportLog) -> Value {
    json!({
        "kind": transport_log_kind_name(log.kind),
        "message": log.message,
    })
}

fn transport_log_from_json(value: Value) -> EngineResult<TransportLog> {
    let kind = value
        .get("kind")
        .and_then(Value::as_str)
        .map(transport_log_kind_from_name)
        .transpose()?
        .ok_or_else(|| invalid_command("adapter transport log is missing kind"))?;
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_command("adapter transport log is missing message"))?
        .to_string();
    Ok(TransportLog { kind, message })
}

fn transport_log_kind_name(kind: TransportLogKind) -> &'static str {
    match kind {
        TransportLogKind::Send => "send",
        TransportLogKind::Receive => "receive",
        TransportLogKind::State => "state",
        TransportLogKind::Output => "output",
        TransportLogKind::Warning => "warning",
        TransportLogKind::Error => "error",
    }
}

fn transport_log_kind_from_name(name: &str) -> EngineResult<TransportLogKind> {
    match name {
        "send" | "Send" => Ok(TransportLogKind::Send),
        "receive" | "Receive" => Ok(TransportLogKind::Receive),
        "state" | "State" => Ok(TransportLogKind::State),
        "output" | "Output" => Ok(TransportLogKind::Output),
        "warning" | "Warning" => Ok(TransportLogKind::Warning),
        "error" | "Error" => Ok(TransportLogKind::Error),
        other => Err(invalid_command(format!(
            "unknown adapter log kind: {other}"
        ))),
    }
}

fn trace_engine_result<T>(operation: &str, started: Instant, result: &EngineResult<T>) {
    match result {
        Ok(_) => napi_trace(format!(
            "{operation} ok elapsed_ms={}",
            started.elapsed().as_millis()
        )),
        Err(error) => napi_trace(format!(
            "{operation} error elapsed_ms={} error={}",
            started.elapsed().as_millis(),
            error
        )),
    }
}

fn trace_transport_output_result(
    operation: &str,
    started: Instant,
    result: &EngineResult<TransportOutput>,
) {
    match result {
        Ok(output) => napi_trace(format!(
            "{operation} ok elapsed_ms={} messages={} events={} completed_requests={} logs={}",
            started.elapsed().as_millis(),
            output.messages.len(),
            output.events.len(),
            output.completed_requests.len(),
            output.logs.len()
        )),
        Err(error) => napi_trace(format!(
            "{operation} error elapsed_ms={} error={}",
            started.elapsed().as_millis(),
            error
        )),
    }
}

fn trace_optional_value<T, F>(operation: &str, detail: impl Into<String>, action: F) -> Option<T>
where
    F: FnOnce() -> Option<T>,
{
    let detail = detail.into();
    let started = Instant::now();
    napi_trace(format!("{operation} start {detail}"));
    let value = action();
    napi_trace(format!(
        "{operation} ok elapsed_ms={} returned={}",
        started.elapsed().as_millis(),
        if value.is_some() { "some" } else { "none" }
    ));
    value
}

fn to_json<T>(value: T) -> Result<Value>
where
    T: serde::Serialize,
{
    serde_json::to_value(value).map_err(to_napi_error)
}

fn from_json<T>(value: Value) -> Result<T>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_value(value).map_err(to_napi_error)
}

fn to_napi_error(error: impl fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}

fn invalid_command(message: impl Into<String>) -> EngineError {
    EngineError::InvalidCommand {
        message: message.into(),
    }
}
