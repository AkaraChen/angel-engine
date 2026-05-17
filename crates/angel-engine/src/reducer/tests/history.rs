use crate::command::{EngineCommand, EngineExtensionCommand};
use crate::event::EngineEvent;
use crate::ids::RemoteConversationId;
use crate::protocol::{ProtocolFlavor, ProtocolMethod};
use crate::state::{
    ActionPhase, ContentDelta, ConversationLifecycle, HistoryMutationOp, HistoryMutationResult,
    HistoryReplayEntry, HistoryReplayToolAction, HistoryRole, HydrationSource,
    conversation_display_messages,
};

use super::{accept_codex_turn, codex_capabilities, engine_with, insert_ready_conversation};

#[test]
fn codex_rollback_marks_workspace_not_reverted() {
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
            EngineExtensionCommand::MutateHistory {
                conversation_id: conversation_id.clone(),
                op: HistoryMutationOp::Rollback { num_turns: 1 },
            },
        ))
        .expect("rollback");
    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::RollbackHistory
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

#[test]
fn history_replay_rejects_tool_entry_without_tool_action() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );

    let error = engine
        .apply_event(EngineEvent::HistoryReplayChunk {
            conversation_id,
            entry: HistoryReplayEntry {
                role: HistoryRole::Tool,
                content: ContentDelta::Text("npm test".to_string()),
                tool: None,
            },
        })
        .expect_err("tool replay entry requires tool action");

    assert_eq!(
        error.to_string(),
        "invalid command: history tool replay entry is missing tool action"
    );
}

#[test]
fn history_replay_rejects_tool_entry_without_tool_id() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );

    let error = engine
        .apply_event(EngineEvent::HistoryReplayChunk {
            conversation_id,
            entry: HistoryReplayEntry {
                role: HistoryRole::Tool,
                content: ContentDelta::Text(String::new()),
                tool: Some(HistoryReplayToolAction {
                    id: None,
                    kind: None,
                    phase: ActionPhase::Completed,
                    title: None,
                    input_summary: None,
                    raw_input: None,
                    output: Vec::new(),
                    error: None,
                }),
            },
        })
        .expect_err("tool replay entry requires tool id");

    assert_eq!(
        error.to_string(),
        "invalid command: history tool replay entry is missing tool id"
    );
}

#[test]
fn hydration_started_clears_existing_visible_history() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );

    engine
        .apply_event(EngineEvent::HistoryReplayChunk {
            conversation_id: conversation_id.clone(),
            entry: HistoryReplayEntry {
                role: HistoryRole::User,
                content: ContentDelta::Text("old history".to_string()),
                tool: None,
            },
        })
        .expect("old replay");
    let turn_id = crate::ids::TurnId::new("turn-1");
    accept_codex_turn(&mut engine, conversation_id.clone(), turn_id.clone());
    engine
        .apply_event(EngineEvent::AssistantDelta {
            conversation_id: conversation_id.clone(),
            turn_id,
            delta: ContentDelta::Text("old live response".to_string()),
        })
        .expect("old live response");
    assert_eq!(
        conversation_display_messages(engine.conversations.get(&conversation_id).unwrap()).len(),
        2
    );

    engine
        .apply_event(EngineEvent::ConversationHydrationStarted {
            id: conversation_id.clone(),
            source: HydrationSource::Resume,
        })
        .expect("hydration started");
    {
        let conversation = engine.conversations.get(&conversation_id).unwrap();
        assert_eq!(
            conversation.lifecycle,
            ConversationLifecycle::Hydrating {
                source: HydrationSource::Resume
            }
        );
        assert!(conversation.history.replay.is_empty());
        assert_eq!(conversation.history.turn_count, 0);
        assert!(conversation.turns.is_empty());
        assert!(conversation.actions.is_empty());
        assert!(conversation.elicitations.is_empty());
        assert!(conversation_display_messages(conversation).is_empty());
    }

    engine
        .apply_event(EngineEvent::HistoryReplayChunk {
            conversation_id: conversation_id.clone(),
            entry: HistoryReplayEntry {
                role: HistoryRole::User,
                content: ContentDelta::Text("new history".to_string()),
                tool: None,
            },
        })
        .expect("new user replay");
    engine
        .apply_event(EngineEvent::HistoryReplayChunk {
            conversation_id: conversation_id.clone(),
            entry: HistoryReplayEntry {
                role: HistoryRole::Assistant,
                content: ContentDelta::Text("new response".to_string()),
                tool: None,
            },
        })
        .expect("new assistant replay");

    let messages =
        conversation_display_messages(engine.conversations.get(&conversation_id).unwrap());
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].role, crate::state::DisplayMessageRole::User);
    assert_eq!(
        messages[1].role,
        crate::state::DisplayMessageRole::Assistant
    );
}
