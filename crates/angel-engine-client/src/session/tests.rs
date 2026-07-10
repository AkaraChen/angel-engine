use crate::event::{ClientEvent, ClientStreamDelta, ClientUpdate};
use crate::{ActionOutputSnapshot, ActionSnapshot, ElicitationSnapshot};

use super::active_turn::ActiveTurn;
use super::types::{TurnRunEvent, TurnRunResult};

#[test]
fn active_turn_projects_resolved_elicitation_updates() {
    let mut active = ActiveTurn::new("conversation".to_string(), Some("turn".to_string()), None);
    active
        .handle_update(ClientUpdate {
            events: vec![ClientEvent::ElicitationOpened {
                conversation_id: "conversation".to_string(),
                elicitation: elicitation("open"),
            }],
            ..ClientUpdate::default()
        })
        .unwrap();

    assert!(matches!(
        active.pop_event(),
        Some(TurnRunEvent::Elicitation { .. })
    ));
    active.pending_elicitation_id = None;

    active
        .handle_update(ClientUpdate {
            events: vec![ClientEvent::ElicitationUpdated {
                conversation_id: "conversation".to_string(),
                elicitation: elicitation("resolved:Allow"),
            }],
            ..ClientUpdate::default()
        })
        .unwrap();

    assert!(matches!(
        active.pop_event(),
        Some(TurnRunEvent::Elicitation {
            message_part,
        }) if message_part.action.as_ref().is_some_and(|action| {
            action.id == "elicitation" && action.phase == "completed"
        })
    ));
    assert!(active.pending_elicitation_id.is_none());
}

#[test]
fn active_turn_preserves_action_lifecycle_events() {
    let mut active = ActiveTurn::new("conversation".to_string(), Some("turn".to_string()), None);
    active
        .handle_update(ClientUpdate {
            events: vec![
                ClientEvent::ActionObserved {
                    conversation_id: "conversation".to_string(),
                    action: action("running"),
                },
                ClientEvent::ActionUpdated {
                    conversation_id: "conversation".to_string(),
                    action: action("completed"),
                },
            ],
            ..ClientUpdate::default()
        })
        .unwrap();

    assert!(matches!(
        active.pop_event(),
        Some(TurnRunEvent::ActionObserved { .. })
    ));
    assert!(matches!(
        active.pop_event(),
        Some(TurnRunEvent::ActionUpdated { .. })
    ));
}

#[test]
fn active_turn_drain_batch_batches_burst() {
    let mut active = ActiveTurn::new("conversation".to_string(), Some("turn".to_string()), None);
    active
        .handle_update(ClientUpdate {
            events: vec![
                ClientEvent::ActionObserved {
                    conversation_id: "conversation".to_string(),
                    action: action("running"),
                },
                ClientEvent::ActionUpdated {
                    conversation_id: "conversation".to_string(),
                    action: action("completed"),
                },
            ],
            ..ClientUpdate::default()
        })
        .unwrap();

    let events = active.drain_batch();

    assert!(matches!(
        events.as_slice(),
        [
            TurnRunEvent::ActionObserved { .. },
            TurnRunEvent::ActionUpdated { .. },
        ]
    ));
    assert!(active.pop_event().is_none());
}

#[test]
fn active_turn_drain_batch_stops_at_elicitation() {
    let mut active = ActiveTurn::new("conversation".to_string(), Some("turn".to_string()), None);
    active
        .handle_update(ClientUpdate {
            events: vec![
                ClientEvent::ActionObserved {
                    conversation_id: "conversation".to_string(),
                    action: action("running"),
                },
                ClientEvent::ElicitationOpened {
                    conversation_id: "conversation".to_string(),
                    elicitation: elicitation("open"),
                },
                ClientEvent::ActionUpdated {
                    conversation_id: "conversation".to_string(),
                    action: action("completed"),
                },
            ],
            ..ClientUpdate::default()
        })
        .unwrap();

    let first = active.drain_batch();
    let second = active.drain_batch();

    assert!(matches!(
        first.as_slice(),
        [
            TurnRunEvent::ActionObserved { .. },
            TurnRunEvent::Elicitation { .. },
        ]
    ));
    assert!(matches!(
        second.as_slice(),
        [TurnRunEvent::ActionUpdated { .. }]
    ));
    assert!(active.pop_event().is_none());
}

#[test]
fn active_turn_waits_for_action_elicitation() {
    let mut active = ActiveTurn::new("conversation".to_string(), Some("turn".to_string()), None);
    let mut action = action("awaitingDecision");
    action.elicitation_id = Some("approval".to_string());

    active
        .handle_update(ClientUpdate {
            events: vec![ClientEvent::ActionUpdated {
                conversation_id: "conversation".to_string(),
                action,
            }],
            ..ClientUpdate::default()
        })
        .unwrap();

    assert_eq!(active.pending_elicitation_id.as_deref(), Some("approval"));
    assert!(matches!(
        active.pop_event(),
        Some(TurnRunEvent::ActionUpdated { .. })
    ));
}

#[test]
fn active_turn_streams_action_output_deltas_without_full_action_snapshots() {
    let mut active = ActiveTurn::new("conversation".to_string(), Some("turn".to_string()), None);

    active
        .handle_update(ClientUpdate {
            events: vec![ClientEvent::ActionObserved {
                conversation_id: "conversation".to_string(),
                action: action("running"),
            }],
            ..ClientUpdate::default()
        })
        .unwrap();
    assert!(matches!(
        active.pop_event(),
        Some(TurnRunEvent::ActionObserved { .. })
    ));

    active
        .handle_update(ClientUpdate {
            events: vec![ClientEvent::ActionUpdated {
                conversation_id: "conversation".to_string(),
                action: action_with_output("running", "x\n"),
            }],
            stream_deltas: vec![ClientStreamDelta::ActionOutputDelta {
                conversation_id: "conversation".to_string(),
                turn_id: "turn".to_string(),
                action_id: "action".to_string(),
                content: output("x\n"),
            }],
            ..ClientUpdate::default()
        })
        .unwrap();
    assert!(matches!(
        active.pop_event(),
        Some(TurnRunEvent::ActionOutputDelta {
            content,
            message_part,
            ..
        }) if content.text == "x\n"
            && message_part.action.as_ref().is_some_and(|action| {
                action.output_text == "x\n"
                    && action.output == vec![output("x\n")]
            })
    ));
    assert!(active.pop_event().is_none());

    active
        .handle_update(ClientUpdate {
            events: vec![ClientEvent::ActionUpdated {
                conversation_id: "conversation".to_string(),
                action: action_with_output("running", "x\nxx\n"),
            }],
            stream_deltas: vec![ClientStreamDelta::ActionOutputDelta {
                conversation_id: "conversation".to_string(),
                turn_id: "turn".to_string(),
                action_id: "action".to_string(),
                content: output("xx\n"),
            }],
            ..ClientUpdate::default()
        })
        .unwrap();
    assert!(matches!(
        active.pop_event(),
        Some(TurnRunEvent::ActionOutputDelta {
            content,
            message_part,
            ..
        }) if content.text == "xx\n"
            && message_part.action.as_ref().is_some_and(|action| {
                action.output_text == "xx\n"
                    && action.output == vec![output("xx\n")]
            })
    ));
    assert!(active.pop_event().is_none());
}

#[test]
fn no_turn_active_request_completes_from_update() {
    let mut active = ActiveTurn::new(
        "conversation".to_string(),
        None,
        Some("request-1".to_string()),
    );

    assert!(!active.request_is_complete());
    active
        .handle_update(ClientUpdate {
            completed_request_ids: vec!["request-1".to_string()],
            ..ClientUpdate::default()
        })
        .unwrap();

    assert!(active.request_is_complete());
}

#[test]
fn turn_run_result_serializes_snapshot_identity() {
    let value = serde_json::to_value(TurnRunResult {
        conversation: None,
        remote_thread_id: None,
        turn_id: None,
    })
    .unwrap();

    assert_eq!(value, serde_json::json!({}));
}

fn elicitation(phase: &str) -> ElicitationSnapshot {
    ElicitationSnapshot {
        action_id: None,
        body: None,
        choices: Vec::new(),
        id: "elicitation".to_string(),
        kind: "approval".to_string(),
        phase: phase.to_string(),
        questions: Vec::new(),
        title: None,
        turn_id: Some("turn".to_string()),
    }
}

fn action(phase: &str) -> ActionSnapshot {
    action_with_output(phase, "")
}

fn action_with_output(phase: &str, text: &str) -> ActionSnapshot {
    let output = (!text.is_empty())
        .then(|| output(text))
        .into_iter()
        .collect();
    ActionSnapshot {
        elicitation_id: None,
        error: None,
        id: "action".to_string(),
        input_summary: None,
        kind: "command".to_string(),
        output,
        output_text: text.to_string(),
        phase: phase.to_string(),
        raw_input: None,
        title: Some("Shell".to_string()),
        turn_id: "turn".to_string(),
    }
}

fn output(text: &str) -> ActionOutputSnapshot {
    ActionOutputSnapshot {
        kind: "text".to_string(),
        text: text.to_string(),
    }
}
