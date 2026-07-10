use std::{fmt, time::Instant};

use angel_engine::{
    AngelEngine, ConversationCapabilities, ConversationId, JsonRpcMessage, ProtocolEffect,
    ProtocolFlavor, SessionModelState, TransportOptions, TransportOutput, UserInput, method_name,
};
use angel_engine_client::{
    ClientOptions as EngineClientOptions, RuntimeAdapter as EngineRuntimeAdapter,
};
use angel_provider::{InterpretedUserInput, ProtocolAdapter as EngineProtocolAdapter};
use napi::bindgen_prelude::*;
use serde_json::Value;

use super::EngineResult;
use super::codec::protocol_flavor_name;
use super::js::JsProtocolAdapter;
use super::trace::{trace_engine_result, trace_optional_value, trace_transport_output_result};
use crate::{json_shape, napi_trace, trace_napi_result};

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
