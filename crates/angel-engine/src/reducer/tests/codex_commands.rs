use crate::adapters::codex::CodexAdapter;
use crate::command::{EngineCommand, EngineExtensionCommand};
use crate::ids::RemoteConversationId;
use crate::protocol::{CodexMethod, ProtocolFlavor, ProtocolMethod};

use super::{engine_with, insert_ready_conversation};

#[test]
fn codex_shell_command_uses_thread_shell_command() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
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
        ProtocolMethod::Codex(CodexMethod::ThreadShellCommand)
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("command"),
        Some(&"echo hello".to_string())
    );
}
