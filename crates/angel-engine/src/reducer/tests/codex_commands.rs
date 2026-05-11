use crate::command::{EngineCommand, EngineExtensionCommand};
use crate::ids::RemoteConversationId;
use crate::protocol::{ProtocolFlavor, ProtocolMethod};

use super::{codex_capabilities, engine_with, insert_ready_conversation};

#[test]
fn codex_shell_command_uses_thread_shell_command() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );

    let plan = engine
        .plan_command(EngineCommand::Extension(
            EngineExtensionCommand::RunShellCommand {
                conversation_id,
                command: "echo hello".to_string(),
            },
        ))
        .expect("codex shell command");
    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::RunShellCommand
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("command"),
        Some(&"echo hello".to_string())
    );
}
