use angel_engine::state::{
    AgentMode, AvailableCommand, AvailableCommandInput, ContextPatch, ContextScope, ContextUpdate,
    ReasoningProfile,
};
use angel_engine::{
    ConversationId, EngineCommand, EngineExtensionCommand, HistoryMutationOp, TurnOverrides,
    UserInput, UserInputKind,
};

use super::CodexAdapter;
use crate::InterpretedUserInput;

pub(super) const SERVICE_TIER_CONTEXT_KEY: &str = "codex.serviceTier";
pub(super) const SERVICE_TIER_FAST: &str = "priority";
pub(super) const SERVICE_TIER_NONE: &str = "null";

pub(super) fn codex_slash_commands() -> Vec<AvailableCommand> {
    // Codex app-server does not currently expose a command catalog. Only
    // advertise slash commands that this adapter can execute through normalized
    // engine commands.
    vec![
        command(
            "model",
            "choose what model and reasoning effort to use",
            Some("model"),
        ),
        command(
            "fast",
            "toggle Fast mode to enable fastest inference with increased plan usage",
            Some("on|off|status"),
        ),
        command("effort", "set Codex reasoning effort", Some("effort")),
        command("reasoning", "set Codex reasoning effort", Some("effort")),
        command("mode", "switch Codex collaboration mode", Some("mode")),
        command(
            "plan",
            "switch to Plan mode or run a prompt in Plan mode",
            Some("prompt"),
        ),
        command(
            "compact",
            "summarize conversation to prevent hitting the context limit",
            None,
        ),
    ]
}

fn command(name: &str, description: &str, input_hint: Option<&str>) -> AvailableCommand {
    AvailableCommand {
        name: name.to_string(),
        description: description.to_string(),
        input: input_hint.map(|hint| AvailableCommandInput {
            hint: hint.to_string(),
        }),
    }
}

impl CodexAdapter {
    pub(super) fn interpret_slash_command(
        &self,
        engine: &angel_engine::AngelEngine,
        conversation_id: &ConversationId,
        input: &[UserInput],
    ) -> Result<Option<InterpretedUserInput>, angel_engine::EngineError> {
        let Some(command_line) = single_text_input(input) else {
            return Ok(None);
        };
        let Some((name, args)) = parse_slash_command(command_line) else {
            return Ok(None);
        };
        let interpreted = match name {
            "fast" => fast_command(engine, conversation_id, args),
            "model" => model_command(engine, conversation_id, args),
            "effort" | "reasoning" => reasoning_command(conversation_id, args),
            "mode" => mode_command(conversation_id, args),
            "plan" => plan_command(conversation_id, args),
            "compact" => InterpretedUserInput {
                command: EngineCommand::Extension(EngineExtensionCommand::MutateHistory {
                    conversation_id: conversation_id.clone(),
                    op: HistoryMutationOp::Compact,
                }),
                message: None,
            },
            _ => return Ok(None),
        };
        Ok(Some(interpreted))
    }
}

fn single_text_input(input: &[UserInput]) -> Option<&str> {
    let [input] = input else {
        return None;
    };
    matches!(input.kind, UserInputKind::Text).then_some(input.content.trim())
}

fn parse_slash_command(command_line: &str) -> Option<(&str, &str)> {
    let rest = command_line.strip_prefix('/')?;
    if rest.starts_with('/') {
        return None;
    }
    let mut parts = rest.splitn(2, char::is_whitespace);
    let name = parts.next()?.trim();
    if name.is_empty() {
        return None;
    }
    Some((name, parts.next().unwrap_or_default().trim()))
}

fn fast_command(
    engine: &angel_engine::AngelEngine,
    conversation_id: &ConversationId,
    args: &str,
) -> InterpretedUserInput {
    let current_on = current_service_tier(engine, conversation_id) == Some(SERVICE_TIER_FAST);
    match args.to_ascii_lowercase().as_str() {
        "" => set_service_tier(conversation_id, !current_on),
        "on" => set_service_tier(conversation_id, true),
        "off" => set_service_tier(conversation_id, false),
        "status" => no_op(
            conversation_id,
            format!("Fast mode is {}.", if current_on { "on" } else { "off" }),
        ),
        _ => no_op(conversation_id, "Usage: /fast [on|off|status]"),
    }
}

fn set_service_tier(conversation_id: &ConversationId, enabled: bool) -> InterpretedUserInput {
    let value = if enabled {
        SERVICE_TIER_FAST
    } else {
        SERVICE_TIER_NONE
    };
    InterpretedUserInput {
        command: EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch::one(ContextUpdate::Raw {
                scope: ContextScope::TurnAndFuture,
                key: SERVICE_TIER_CONTEXT_KEY.to_string(),
                value: value.to_string(),
            }),
        },
        message: Some(format!(
            "Fast mode is {}.",
            if enabled { "on" } else { "off" }
        )),
    }
}

fn model_command(
    engine: &angel_engine::AngelEngine,
    conversation_id: &ConversationId,
    args: &str,
) -> InterpretedUserInput {
    if args.is_empty() {
        let model = current_model(engine, conversation_id).unwrap_or("(default)");
        return no_op(conversation_id, format!("Current model: {model}"));
    }
    InterpretedUserInput {
        command: EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch::one(ContextUpdate::Model {
                scope: ContextScope::TurnAndFuture,
                model: Some(args.to_string()),
            }),
        },
        message: Some(format!("Model set to {args}.")),
    }
}

fn reasoning_command(conversation_id: &ConversationId, args: &str) -> InterpretedUserInput {
    if args.is_empty() {
        return no_op(conversation_id, "Usage: /reasoning <effort>");
    }
    InterpretedUserInput {
        command: EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch::one(ContextUpdate::Reasoning {
                scope: ContextScope::TurnAndFuture,
                reasoning: Some(ReasoningProfile {
                    effort: Some(args.to_ascii_lowercase()),
                }),
            }),
        },
        message: Some(format!("Reasoning effort set to {args}.")),
    }
}

fn mode_command(conversation_id: &ConversationId, args: &str) -> InterpretedUserInput {
    if args.is_empty() {
        return no_op(conversation_id, "Usage: /mode <mode>");
    }
    set_mode(conversation_id, args, format!("Mode set to {args}."))
}

fn plan_command(conversation_id: &ConversationId, args: &str) -> InterpretedUserInput {
    if args.is_empty() {
        return set_mode(conversation_id, "plan", "Plan mode enabled.");
    }
    InterpretedUserInput {
        command: EngineCommand::StartTurn {
            conversation_id: conversation_id.clone(),
            input: vec![UserInput::text(args.to_string())],
            overrides: TurnOverrides {
                context: ContextPatch::one(ContextUpdate::Mode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(AgentMode {
                        id: "plan".to_string(),
                    }),
                }),
            },
        },
        message: None,
    }
}

fn set_mode(
    conversation_id: &ConversationId,
    mode: &str,
    message: impl Into<String>,
) -> InterpretedUserInput {
    InterpretedUserInput {
        command: EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch::one(ContextUpdate::Mode {
                scope: ContextScope::TurnAndFuture,
                mode: Some(AgentMode {
                    id: mode.to_string(),
                }),
            }),
        },
        message: Some(message.into()),
    }
}

fn no_op(conversation_id: &ConversationId, message: impl Into<String>) -> InterpretedUserInput {
    InterpretedUserInput {
        command: EngineCommand::UpdateContext {
            conversation_id: conversation_id.clone(),
            patch: ContextPatch::empty(),
        },
        message: Some(message.into()),
    }
}

fn current_service_tier<'a>(
    engine: &'a angel_engine::AngelEngine,
    conversation_id: &ConversationId,
) -> Option<&'a str> {
    engine
        .conversations
        .get(conversation_id)?
        .context
        .raw
        .get(SERVICE_TIER_CONTEXT_KEY)?
        .effective()
        .map(String::as_str)
}

fn current_model<'a>(
    engine: &'a angel_engine::AngelEngine,
    conversation_id: &ConversationId,
) -> Option<&'a str> {
    let conversation = engine.conversations.get(conversation_id)?;
    conversation
        .context
        .model
        .effective()
        .and_then(Option::as_deref)
        .or_else(|| {
            conversation
                .model_state
                .as_ref()
                .map(|models| models.current_model_id.as_str())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use angel_engine::{
        AngelEngine, EngineEvent, ProtocolFlavor, RemoteConversationId, RuntimeCapabilities,
    };

    #[test]
    fn fast_slash_updates_service_tier_without_starting_turn() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_conversation(&adapter);
        let conversation_id = ConversationId::new("conv");

        let interpreted = adapter
            .interpret_slash_command(&engine, &conversation_id, &[UserInput::text("/fast")])
            .expect("interpret")
            .expect("slash command");

        assert_eq!(interpreted.message.as_deref(), Some("Fast mode is on."));
        assert!(matches!(
            interpreted.command,
            EngineCommand::UpdateContext { patch, .. }
                if matches!(
                    patch.updates.as_slice(),
                    [ContextUpdate::Raw { key, value, .. }]
                        if key == SERVICE_TIER_CONTEXT_KEY && value == SERVICE_TIER_FAST
                )
        ));
    }

    #[test]
    fn plan_slash_with_prompt_starts_turn_with_plan_override() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_conversation(&adapter);
        let conversation_id = ConversationId::new("conv");

        let interpreted = adapter
            .interpret_slash_command(
                &engine,
                &conversation_id,
                &[UserInput::text("/plan design this")],
            )
            .expect("interpret")
            .expect("slash command");

        assert!(matches!(
            interpreted.command,
            EngineCommand::StartTurn { input, overrides, .. }
                if input == vec![UserInput::text("design this")]
                    && matches!(
                        overrides.context.updates.as_slice(),
                        [ContextUpdate::Mode { mode: Some(AgentMode { id }), .. }] if id == "plan"
                    )
        ));
    }

    #[test]
    fn unknown_slash_is_not_intercepted() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_conversation(&adapter);
        let conversation_id = ConversationId::new("conv");

        let interpreted = adapter
            .interpret_slash_command(
                &engine,
                &conversation_id,
                &[UserInput::text("/not-a-command")],
            )
            .expect("interpret");

        assert!(interpreted.is_none());
    }

    #[test]
    fn advertised_slash_commands_are_interpreted() {
        let adapter = CodexAdapter::app_server();
        let engine = engine_with_conversation(&adapter);
        let conversation_id = ConversationId::new("conv");

        for command in codex_slash_commands() {
            let input = match command.name.as_str() {
                "model" => "/model",
                "fast" => "/fast status",
                "effort" => "/effort high",
                "reasoning" => "/reasoning low",
                "mode" => "/mode default",
                "plan" => "/plan",
                "compact" => "/compact",
                name => panic!("advertised /{name} is not covered by the adapter"),
            };
            let interpreted = adapter
                .interpret_slash_command(&engine, &conversation_id, &[UserInput::text(input)])
                .expect("interpret")
                .unwrap_or_else(|| panic!("advertised command {input} was not interpreted"));

            assert!(
                !interpreted
                    .message
                    .as_deref()
                    .is_some_and(|message| message.contains("not available here")),
                "advertised command {input} only produced an unavailable no-op"
            );
        }
    }

    #[test]
    fn tui_only_slash_commands_are_not_advertised() {
        let commands = codex_slash_commands()
            .into_iter()
            .map(|command| command.name)
            .collect::<Vec<_>>();

        for tui_only in ["copy", "raw", "theme", "quit", "review", "mention"] {
            assert!(
                !commands.iter().any(|command| command == tui_only),
                "/{tui_only} should not be advertised by the engine adapter"
            );
        }
    }

    fn engine_with_conversation(adapter: &CodexAdapter) -> AngelEngine {
        let mut engine = AngelEngine::with_available_runtime(
            ProtocolFlavor::CodexAppServer,
            RuntimeCapabilities::new("test"),
            adapter.capabilities(),
        );
        let conversation_id = ConversationId::new("conv");
        engine
            .apply_event(EngineEvent::ConversationProvisionStarted {
                id: conversation_id.clone(),
                remote: RemoteConversationId::Known("thread".to_string()),
                op: angel_engine::ProvisionOp::New,
                capabilities: adapter.capabilities(),
            })
            .expect("conversation provision");
        engine
            .apply_event(EngineEvent::ConversationReady {
                id: conversation_id,
                remote: Some(RemoteConversationId::Known("thread".to_string())),
                context: ContextPatch::empty(),
                capabilities: None,
            })
            .expect("conversation ready");
        engine
    }
}
