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
    // Codex app-server does not currently expose a command catalog; mirror the
    // TUI's built-in slash command table inside the Codex adapter boundary.
    let mut commands = vec![
        command(
            "model",
            "choose what model and reasoning effort to use",
            None,
        ),
        command(
            "fast",
            "toggle Fast mode to enable fastest inference with increased plan usage",
            Some("[on|off|status]"),
        ),
        command(
            "ide",
            "include current selection, open files, and other context from your IDE",
            Some("[on|off|status]"),
        ),
        command("permissions", "choose what Codex is allowed to do", None),
        command("keymap", "remap TUI shortcuts", Some("[debug]")),
        command("vim", "toggle Vim mode for the composer", None),
    ];

    if cfg!(target_os = "windows") {
        commands.extend([
            command(
                "setup-default-sandbox",
                "set up elevated agent sandbox",
                None,
            ),
            command(
                "sandbox-add-read-dir",
                "let sandbox read a directory: /sandbox-add-read-dir <absolute_path>",
                Some("<absolute_path>"),
            ),
        ]);
    }

    commands.extend([
        command("experimental", "toggle experimental features", None),
        command(
            "approve",
            "approve one retry of a recent auto-review denial",
            None,
        ),
        command("memories", "configure memory use and generation", None),
        command(
            "skills",
            "use skills to improve how Codex performs specific tasks",
            None,
        ),
        command("hooks", "view and manage lifecycle hooks", None),
        command(
            "review",
            "review my current changes and find issues",
            Some("[instructions]"),
        ),
        command("rename", "rename the current thread", Some("<title>")),
        command("new", "start a new chat during a conversation", None),
        command("resume", "resume a saved chat", Some("[thread]")),
        command("fork", "fork the current chat", None),
        command(
            "init",
            "create an AGENTS.md file with instructions for Codex",
            None,
        ),
        command(
            "compact",
            "summarize conversation to prevent hitting the context limit",
            None,
        ),
        command("plan", "switch to Plan mode", Some("[prompt]")),
        command(
            "goal",
            "set or view the goal for a long-running task",
            Some("[objective|clear|pause|resume]"),
        ),
        command("collab", "change collaboration mode (experimental)", None),
        command("agent", "switch the active agent thread", None),
        command(
            "side",
            "start a side conversation in an ephemeral fork",
            Some("<prompt>"),
        ),
        command("copy", "copy last response as markdown", None),
        command(
            "raw",
            "toggle raw scrollback mode for copy-friendly terminal selection",
            Some("[on|off]"),
        ),
        command("diff", "show git diff (including untracked files)", None),
        command("mention", "mention a file", None),
        command(
            "status",
            "show current session configuration and token usage",
            None,
        ),
        command(
            "debug-config",
            "show config layers and requirement sources for debugging",
            None,
        ),
        command(
            "title",
            "configure which items appear in the terminal title",
            None,
        ),
        command(
            "statusline",
            "configure which items appear in the status line",
            None,
        ),
        command("theme", "choose a syntax highlighting theme", None),
        command(
            "mcp",
            "list configured MCP tools; use /mcp verbose for details",
            Some("[verbose]"),
        ),
        command("apps", "manage apps", None),
        command("plugins", "browse plugins", None),
        command("logout", "log out of Codex", None),
        command("quit", "exit Codex", None),
        command("exit", "exit Codex", None),
        command("feedback", "send logs to maintainers", None),
        command("ps", "list background terminals", None),
        command("stop", "stop all background terminals", None),
        command("clear", "clear the terminal and start a new chat", None),
        command(
            "personality",
            "choose a communication style for Codex",
            None,
        ),
        command(
            "realtime",
            "toggle realtime voice mode (experimental)",
            None,
        ),
        command("settings", "configure realtime microphone/speaker", None),
        command("subagents", "switch the active agent thread", None),
    ]);

    if cfg!(debug_assertions) {
        commands.extend([
            command("rollout", "print the rollout file path", None),
            command("test-approval", "test approval request", None),
        ]);
    }

    commands
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
        if !codex_slash_commands()
            .iter()
            .any(|command| command.name == name)
        {
            return Ok(None);
        }

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
            _ => no_op(
                conversation_id,
                format!("Slash command /{name} is a Codex UI command and is not available here."),
            ),
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
