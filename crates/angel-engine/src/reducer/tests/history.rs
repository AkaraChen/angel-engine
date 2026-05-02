use crate::adapters::codex::CodexAdapter;
use crate::command::{EngineCommand, EngineExtensionCommand};
use crate::event::EngineEvent;
use crate::ids::RemoteConversationId;
use crate::protocol::{CodexMethod, ProtocolFlavor, ProtocolMethod};
use crate::state::{ConversationLifecycle, HistoryMutationOp, HistoryMutationResult};

use super::{engine_with, insert_ready_conversation};

#[test]
fn codex_rollback_marks_workspace_not_reverted() {
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
            EngineExtensionCommand::MutateHistory {
                conversation_id: conversation_id.clone(),
                op: HistoryMutationOp::Rollback { num_turns: 1 },
            },
        ))
        .expect("rollback");
    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::Codex(CodexMethod::ThreadRollback)
    ));

    engine
        .apply_event(EngineEvent::HistoryMutationFinished {
            conversation_id: conversation_id.clone(),
            result: HistoryMutationResult {
                success: true,
                workspace_reverted: false,
                message: None,
            },
        })
        .expect("rollback finished");
    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert_eq!(conversation.lifecycle, ConversationLifecycle::Idle);
    assert_eq!(conversation.history.workspace_reverted, Some(false));
}
