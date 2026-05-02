use crate::adapters::acp::{AcpAdapter, AcpStopReason};
use crate::adapters::codex::CodexAdapter;
use crate::event::EngineEvent;
use crate::ids::{ConversationId, RemoteConversationId, TurnId};
use crate::protocol::ProtocolFlavor;
use crate::state::{
    ContentDelta, ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle, TurnOutcome,
    TurnPhase,
};

use super::{engine_with, insert_ready_conversation, start_turn};
use crate::reducer::{EnginePolicy, InvalidEventPolicy};

#[test]
fn ignore_stale_delta_does_not_revive_terminal_turn() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    engine.policy = EnginePolicy {
        invalid_event_policy: InvalidEventPolicy::IgnoreStale,
    };
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
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
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
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
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
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
fn rediscovery_updates_context_without_resetting_loaded_conversation() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        adapter.capabilities(),
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
            capabilities: adapter.capabilities(),
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
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());

    engine
        .apply_event(EngineEvent::ConversationDiscoveryPage {
            cursor: Some("page-1".to_string()),
            next_cursor: Some("page-2".to_string()),
        })
        .expect("discovery page");

    assert_eq!(engine.discovery.cursor.as_deref(), Some("page-1"));
    assert_eq!(engine.discovery.next_cursor.as_deref(), Some("page-2"));
}

#[test]
fn acp_stop_reason_maps_to_refused_terminal() {
    let adapter = AcpAdapter::standard();
    let event = adapter.stop_reason_event(
        ConversationId::new("conv"),
        TurnId::new("turn"),
        AcpStopReason::Refusal,
    );
    assert!(matches!(
        event,
        EngineEvent::TurnTerminal {
            outcome: TurnOutcome::Refused,
            ..
        }
    ));
}
