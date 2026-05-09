use crate::event::EngineEvent;
use crate::ids::{ActionId, RemoteConversationId};
use crate::protocol::ProtocolFlavor;
use crate::state::{
    ActionKind, ActionOutputDelta, ActionPatch, ActionPhase, ActionState, ContentDelta,
    ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle, DisplayMessagePart,
    DisplayTextPartKind, PlanDisplayKind, PlanEntry, PlanEntryStatus, PlanState, TurnOutcome,
    TurnPhase, conversation_display_messages,
};

use super::{
    acp_capabilities, codex_capabilities, engine_with, insert_ready_conversation, start_turn,
};
use crate::reducer::{EnginePolicy, InvalidEventPolicy};

#[test]
fn ignore_stale_delta_does_not_revive_terminal_turn() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    engine.policy = EnginePolicy {
        invalid_event_policy: InvalidEventPolicy::IgnoreStale,
    };
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());
    engine
        .apply_event(EngineEvent::TurnTerminal {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            outcome: TurnOutcome::Succeeded,
        })
        .expect("terminal");
    let report = engine
        .apply_event(EngineEvent::AssistantDelta {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            delta: ContentDelta::Text("late".to_string()),
        })
        .expect("ignore stale");
    assert!(report.ui_events.is_empty());
    let turn = &engine.conversations[&conversation_id].turns[&turn_id];
    assert!(matches!(turn.phase, TurnPhase::Terminal(_)));
    assert!(turn.output.chunks.is_empty());
}

#[test]
fn plan_delta_is_stored_on_turn_without_assistant_output() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());

    engine
        .apply_event(EngineEvent::PlanDelta {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            delta: ContentDelta::Text("# Plan\n".to_string()),
        })
        .expect("plan delta");

    let turn = &engine.conversations[&conversation_id].turns[&turn_id];
    assert_eq!(
        turn.plan_text.chunks,
        vec![ContentDelta::Text("# Plan\n".to_string())]
    );
    assert!(turn.output.chunks.is_empty());
    assert!(matches!(turn.phase, TurnPhase::Planning));
}

#[test]
fn plan_path_is_stored_on_turn() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());

    engine
        .apply_event(EngineEvent::PlanPathUpdated {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            path: "plans/plan.md".to_string(),
        })
        .expect("plan path");

    let turn = &engine.conversations[&conversation_id].turns[&turn_id];
    assert_eq!(turn.plan_path.as_deref(), Some("plans/plan.md"));
    assert!(matches!(turn.phase, TurnPhase::Planning));
}

#[test]
fn completed_turn_display_preserves_event_order() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());

    engine
        .apply_event(EngineEvent::ReasoningDelta {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            delta: ContentDelta::Text("first thought".to_string()),
        })
        .expect("reasoning");

    let mut first_action = ActionState::new(
        ActionId::new("call-1"),
        turn_id.clone(),
        ActionKind::Command,
    );
    first_action.phase = ActionPhase::Running;
    first_action.title = Some("git status".to_string());
    engine
        .apply_event(EngineEvent::ActionObserved {
            conversation_id: conversation_id.clone(),
            action: first_action,
        })
        .expect("first action");
    engine
        .apply_event(EngineEvent::ActionUpdated {
            conversation_id: conversation_id.clone(),
            action_id: ActionId::new("call-1"),
            patch: ActionPatch {
                phase: Some(ActionPhase::Completed),
                output_delta: Some(ActionOutputDelta::Text("clean".to_string())),
                error: None,
                title: None,
            },
        })
        .expect("first output");

    engine
        .apply_event(EngineEvent::AssistantDelta {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            delta: ContentDelta::Text("middle reply".to_string()),
        })
        .expect("assistant");
    engine
        .apply_event(EngineEvent::ReasoningDelta {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            delta: ContentDelta::Text("second thought".to_string()),
        })
        .expect("second reasoning");

    let mut second_action = ActionState::new(
        ActionId::new("call-2"),
        turn_id.clone(),
        ActionKind::Command,
    );
    second_action.phase = ActionPhase::Completed;
    second_action.title = Some("npm test".to_string());
    engine
        .apply_event(EngineEvent::ActionObserved {
            conversation_id: conversation_id.clone(),
            action: second_action,
        })
        .expect("second action");

    engine
        .apply_event(EngineEvent::PlanUpdated {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            plan: PlanState {
                entries: vec![PlanEntry {
                    content: "Implement the UI".to_string(),
                    status: PlanEntryStatus::InProgress,
                }],
            },
        })
        .expect("plan");
    engine
        .apply_event(EngineEvent::AssistantDelta {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            delta: ContentDelta::Text("final reply".to_string()),
        })
        .expect("final assistant");

    let conversation = &engine.conversations[&conversation_id];
    let messages = conversation_display_messages(engine.protocol, conversation);
    let assistant = messages
        .iter()
        .find(|message| message.id == format!("{turn_id}:assistant"))
        .expect("assistant message");

    assert!(matches!(
        assistant.content.as_slice(),
        [
            DisplayMessagePart::Text { kind: DisplayTextPartKind::Reasoning, text: first_reasoning },
            DisplayMessagePart::ToolCall { action: first_tool },
            DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text: middle_text },
            DisplayMessagePart::Text { kind: DisplayTextPartKind::Reasoning, text: second_reasoning },
            DisplayMessagePart::ToolCall { action: second_tool },
            DisplayMessagePart::Plan { entries, .. },
            DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text: final_text }
        ] if first_reasoning == "first thought"
            && first_tool.id == "call-1"
            && first_tool.output_text == "clean"
            && middle_text == "middle reply"
            && second_reasoning == "second thought"
            && second_tool.id == "call-2"
            && entries.len() == 1
            && entries[0].content == "Implement the UI"
            && final_text == "final reply"
    ));
}

#[test]
fn todo_update_does_not_replace_review_plan() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());

    engine
        .apply_event(EngineEvent::PlanUpdated {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            plan: PlanState {
                entries: vec![PlanEntry {
                    content: "Review the color system".to_string(),
                    status: PlanEntryStatus::Pending,
                }],
            },
        })
        .expect("review plan");
    engine
        .apply_event(EngineEvent::TodoUpdated {
            conversation_id: conversation_id.clone(),
            turn_id: turn_id.clone(),
            todo: PlanState {
                entries: vec![PlanEntry {
                    content: "Apply blue theme".to_string(),
                    status: PlanEntryStatus::Completed,
                }],
            },
        })
        .expect("todo update");

    let conversation = &engine.conversations[&conversation_id];
    let turn = &conversation.turns[&turn_id];
    assert_eq!(turn.plan.as_ref().expect("plan").entries.len(), 1);
    assert_eq!(turn.todo.as_ref().expect("todo").entries.len(), 1);
    assert!(matches!(turn.phase, TurnPhase::Planning));

    let messages = conversation_display_messages(engine.protocol, conversation);
    let assistant = messages
        .iter()
        .find(|message| message.id == format!("{turn_id}:assistant"))
        .expect("assistant message");

    assert!(matches!(
        assistant.content.as_slice(),
        [
            DisplayMessagePart::Plan { kind: PlanDisplayKind::Review, entries: review, .. },
            DisplayMessagePart::Plan { kind: PlanDisplayKind::Todo, entries: todo, .. }
        ] if review[0].content == "Review the color system"
            && todo[0].content == "Apply blue theme"
            && todo[0].status == PlanEntryStatus::Completed
    ));
}

#[test]
fn rediscovery_updates_context_without_resetting_loaded_conversation() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities.clone(),
    );

    engine
        .apply_event(EngineEvent::ConversationDiscovered {
            id: conversation_id.clone(),
            remote: RemoteConversationId::Known("thread".to_string()),
            context: ContextPatch::one(ContextUpdate::Raw {
                scope: ContextScope::Conversation,
                key: "conversation.title".to_string(),
                value: "Updated".to_string(),
            }),
            capabilities: capabilities.clone(),
        })
        .expect("rediscovery");

    let conversation = &engine.conversations[&conversation_id];
    assert!(matches!(
        conversation.lifecycle,
        ConversationLifecycle::Idle
    ));
    assert_eq!(
        conversation
            .context
            .raw
            .get("conversation.title")
            .and_then(|title| title.effective()),
        Some(&"Updated".to_string())
    );
}

#[test]
fn discovery_page_updates_common_pagination_state() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());

    engine
        .apply_event(EngineEvent::ConversationDiscoveryPage {
            cursor: Some("page-1".to_string()),
            next_cursor: Some("page-2".to_string()),
        })
        .expect("discovery page");

    assert_eq!(engine.discovery.cursor.as_deref(), Some("page-1"));
    assert_eq!(engine.discovery.next_cursor.as_deref(), Some("page-2"));
}
