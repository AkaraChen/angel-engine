use std::{fmt, time::Instant};

use angel_engine::{
    AngelEngine, ConversationCapabilities, ConversationId, JsonRpcMessage, ProtocolEffect,
    ProtocolFlavor, TransportOptions, TransportOutput, UserInput, method_name,
};
use angel_engine_client::{
    ClientOptions as EngineClientOptions, ClientProtocol as EngineClientProtocol,
};
use angel_provider::acp::AcpAdapter as EngineAcpAdapter;
use angel_provider::{InterpretedUserInput, ProtocolAdapter as EngineProtocolAdapter};
use napi::bindgen_prelude::*;

use super::EngineResult;
use super::acp::AcpAdapter;
use super::codec::from_json;
use super::trace::{trace_engine_result, trace_transport_output_result};
use crate::{json_shape, napi_trace};

#[derive(Clone)]
pub(super) enum NativeBaseAdapter {
    Acp(EngineAcpAdapter),
}

impl NativeBaseAdapter {
    pub(super) fn kind_name(&self) -> &'static str {
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

    pub(super) fn encode_effect(
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

    pub(super) fn decode_message(
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

    pub(super) fn interpret_user_input(
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

pub(super) fn native_acp_adapter(adapter: &Object<'_>) -> Option<EngineAcpAdapter> {
    adapter
        .unwrap::<AcpAdapter>()
        .ok()
        .map(|adapter| adapter.adapter.clone())
}

pub(super) fn native_base_adapter_from_js(
    adapter: &Object<'_>,
) -> Result<Option<NativeBaseAdapter>> {
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

pub(super) fn method_is_overridden_before_native_base(
    adapter: &Object<'_>,
    method: &str,
) -> Result<bool> {
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

pub(super) fn protocol_flavor_from_js(
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

pub(super) fn capabilities_from_js(
    adapter: &Object<'_>,
    native_base: Option<&NativeBaseAdapter>,
    flavor: ProtocolFlavor,
) -> Result<ConversationCapabilities> {
    if let Some(function) = adapter.get::<Function<'_, (), serde_json::Value>>("capabilities")? {
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
