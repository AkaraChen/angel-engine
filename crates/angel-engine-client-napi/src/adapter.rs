use std::fmt;

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
        let need_authentication = options
            .as_ref()
            .and_then(|value| value.get("needAuthentication"))
            .and_then(Value::as_bool)
            .unwrap_or(true);
        let adapter = if need_authentication {
            EngineAcpAdapter::standard()
        } else {
            EngineAcpAdapter::without_authentication()
        };
        Ok(Self { adapter })
    }

    #[napi(js_name = "_angelNativeAdapterKind")]
    pub fn native_adapter_kind(&self) -> String {
        "acp".to_string()
    }

    #[napi(js_name = "_angelNativeAcpNeedAuthentication")]
    pub fn native_acp_need_authentication(&self) -> bool {
        self.adapter
            .adapter_capabilities()
            .runtime
            .authentication
            .is_supported()
    }

    #[napi(js_name = "protocolFlavor", ts_return_type = "`${ClientProtocol}`")]
    pub fn protocol_flavor(&self) -> String {
        "acp".to_string()
    }

    #[napi(ts_return_type = "unknown")]
    pub fn capabilities(&self) -> Result<Value> {
        to_json(self.adapter.capabilities())
    }

    #[napi(
        js_name = "encodeEffect",
        ts_args_type = "input: AdapterEncodeInput",
        ts_return_type = "TransportOutput"
    )]
    pub fn encode_effect(&self, input: Value) -> Result<Value> {
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
        _result: Value,
        _current_model_id: Option<String>,
    ) -> Option<Value> {
        None
    }
}

pub(crate) enum NapiRuntimeAdapter {
    Builtin(EngineRuntimeAdapter),
    Js(JsProtocolAdapter),
}

impl NapiRuntimeAdapter {
    pub(crate) fn new(options: &EngineClientOptions, adapter: Option<Object<'_>>) -> Result<Self> {
        match adapter {
            Some(adapter) => Ok(Self::Js(JsProtocolAdapter::new(options, adapter)?)),
            None => Ok(Self::Builtin(EngineRuntimeAdapter::from_options(options))),
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
        match self {
            Self::Builtin(adapter) => adapter.protocol_flavor(),
            Self::Js(adapter) => adapter.protocol_flavor(),
        }
    }

    fn capabilities(&self) -> ConversationCapabilities {
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
        match self {
            Self::Builtin(adapter) => adapter.encode_effect(engine, effect, options),
            Self::Js(adapter) => adapter.encode_effect(engine, effect, options),
        }
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> EngineResult<TransportOutput> {
        match self {
            Self::Builtin(adapter) => adapter.decode_message(engine, message),
            Self::Js(adapter) => adapter.decode_message(engine, message),
        }
    }

    fn model_catalog_from_runtime_debug(
        &self,
        result: &Value,
        current_model_id: Option<&str>,
    ) -> Option<SessionModelState> {
        match self {
            Self::Builtin(adapter) => {
                adapter.model_catalog_from_runtime_debug(result, current_model_id)
            }
            Self::Js(adapter) => adapter.model_catalog_from_runtime_debug(result, current_model_id),
        }
    }

    fn interpret_user_input(
        &self,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        input: &[UserInput],
    ) -> EngineResult<Option<InterpretedUserInput>> {
        match self {
            Self::Builtin(adapter) => adapter.interpret_user_input(engine, conversation_id, input),
            Self::Js(adapter) => adapter.interpret_user_input(engine, conversation_id, input),
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
        let env = Env::from(adapter.value().env);
        let native_base = native_acp_adapter(&adapter)
            .map(NativeBaseAdapter::Acp)
            .or_else(|| native_base_adapter_from_js(&adapter).ok().flatten());
        let flavor = protocol_flavor_from_js(&adapter, native_base.as_ref(), options)?;
        let capabilities = capabilities_from_js(&adapter, native_base.as_ref(), flavor)?;
        Ok(Self {
            env,
            object: Some(adapter.create_ref::<false>()?),
            flavor,
            capabilities,
            native_base,
        })
    }

    fn call_transport_method(
        &self,
        method: &str,
        mut input: Value,
    ) -> EngineResult<TransportOutput> {
        let object = self.object_value()?;
        let object_ref = self.object_ref()?;
        let function: Function<'_, Value, Value> =
            object.get_named_property(method).map_err(|error| {
                invalid_command(format!("adapter.{method} is not callable: {error}"))
            })?;
        let output = function
            .apply(object_ref, input.take())
            .map_err(|error| invalid_command(format!("adapter.{method} threw: {error}")))?;
        transport_output_from_json(output)
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
            return None;
        }
        serde_json::from_value(value).ok()
    }

    fn interpret_user_input(
        &self,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        input: &[UserInput],
    ) -> EngineResult<Option<InterpretedUserInput>> {
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
    fn protocol_flavor(&self) -> ProtocolFlavor {
        match self {
            Self::Acp(adapter) => adapter.protocol_flavor(),
        }
    }

    fn capabilities(&self) -> ConversationCapabilities {
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
        match self {
            Self::Acp(adapter) => adapter.encode_effect(engine, effect, options),
        }
    }

    fn decode_message(
        &self,
        engine: &AngelEngine,
        message: &JsonRpcMessage,
    ) -> EngineResult<TransportOutput> {
        match self {
            Self::Acp(adapter) => adapter.decode_message(engine, message),
        }
    }

    fn interpret_user_input(
        &self,
        engine: &AngelEngine,
        conversation_id: &ConversationId,
        input: &[UserInput],
    ) -> EngineResult<Option<InterpretedUserInput>> {
        match self {
            Self::Acp(adapter) => adapter.interpret_user_input(engine, conversation_id, input),
        }
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
        EngineClientProtocol::CodexAppServer => ProtocolFlavor::CodexAppServer,
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
        ProtocolFlavor::Acp => ConversationCapabilities::acp_standard(),
        ProtocolFlavor::CodexAppServer => ConversationCapabilities::codex_app_server(),
    })
}

fn parse_protocol_flavor(value: &str) -> Result<ProtocolFlavor> {
    match value {
        "acp" => Ok(ProtocolFlavor::Acp),
        "codexAppServer" => Ok(ProtocolFlavor::CodexAppServer),
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
    let messages = array_field(&value, "messages")
        .into_iter()
        .map(JsonRpcMessage::from_value)
        .collect::<EngineResult<Vec<_>>>()?;
    let events = if let Some(events) = value.get("events").cloned() {
        serde_json::from_value::<Vec<EngineEvent>>(events)
            .map_err(|error| invalid_command(format!("invalid adapter events: {error}")))?
    } else {
        Vec::new()
    };
    let completed_requests = array_field(&value, "completedRequests")
        .into_iter()
        .chain(array_field(&value, "completed_requests"))
        .map(|value| JsonRpcRequestId::from_json_value(&value))
        .collect();
    let logs = array_field(&value, "logs")
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

fn array_field(value: &Value, field: &str) -> Vec<Value> {
    value
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
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
        .unwrap_or(TransportLogKind::Output);
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or_default()
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
