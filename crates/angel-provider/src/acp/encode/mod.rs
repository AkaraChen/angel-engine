mod config;
mod elicitation;
mod initialize;
mod lifecycle;
mod prompt;

#[cfg(test)]
mod tests;

use super::wire::AGENT_METHOD_NAMES;
use super::*;

#[cfg(test)]
use elicitation::select_permission_option;

impl AcpAdapter {
    pub(super) fn encode_update_context_effect(
        &self,
        engine: &AngelEngine,
        effect: &angel_engine::ProtocolEffect,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        config::update_context_effect(engine, effect)
    }

    pub(super) fn encode_permission_response(
        &self,
        engine: &AngelEngine,
        effect: &angel_engine::ProtocolEffect,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        elicitation::permission_response(engine, effect)
    }

    pub(super) fn encode_params(
        &self,
        engine: &AngelEngine,
        effect: &angel_engine::ProtocolEffect,
        options: &TransportOptions,
    ) -> Result<Value, angel_engine::EngineError> {
        if let ProtocolMethod::Extension(method) = &effect.method
            && method == AGENT_METHOD_NAMES.session_fork
        {
            return lifecycle::acp_fork_params(engine, effect);
        }
        match &effect.method {
            ProtocolMethod::Initialize => Ok(initialize::initialize_params(self, options)),
            ProtocolMethod::Authenticate => Ok(initialize::authenticate_params(effect)),
            ProtocolMethod::StartConversation => {
                Ok(lifecycle::start_conversation_params(engine, effect))
            }
            ProtocolMethod::ResumeConversation => {
                Ok(lifecycle::resume_conversation_params(engine, effect))
            }
            ProtocolMethod::StartTurn => prompt::start_turn_params(engine, effect),
            ProtocolMethod::CancelTurn | ProtocolMethod::CloseConversation => {
                lifecycle::session_id_params(engine, effect)
            }
            ProtocolMethod::ListConversations => Ok(lifecycle::list_conversations_params(effect)),
            ProtocolMethod::SetSessionConfigOption => {
                config::set_config_option_params(engine, effect)
            }
            ProtocolMethod::SetSessionMode => config::set_mode_params(engine, effect),
            ProtocolMethod::SetSessionModel => config::set_model_params(engine, effect),
            ProtocolMethod::ResolveElicitation => Err(angel_engine::EngineError::InvalidCommand {
                message: "permission responses are encoded by encode_permission_response"
                    .to_string(),
            }),
            ProtocolMethod::ForkConversation => lifecycle::acp_fork_params(engine, effect),
            ProtocolMethod::ArchiveConversation
            | ProtocolMethod::UnarchiveConversation
            | ProtocolMethod::Unsubscribe => lifecycle::session_id_params(engine, effect),
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
}
