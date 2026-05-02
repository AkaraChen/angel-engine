use crate::adapters::codex::CodexAdapter;
use crate::command::EngineCommand;
use crate::event::EngineEvent;
use crate::ids::{
    ActionId, ElicitationId, JsonRpcRequestId, RemoteConversationId, RemoteRequestId,
};
use crate::protocol::ProtocolFlavor;
use crate::state::{
    ActionKind, ActionPhase, ActionState, ElicitationDecision, ElicitationKind, ElicitationPhase,
    ElicitationState, TurnPhase, UserAnswer,
};

use super::{engine_with, insert_ready_conversation, start_turn};

#[test]
fn elicitation_drives_action_and_turn_overlay() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
    );
    let turn_id = start_turn(&mut engine, conversation_id.clone());
    let action_id = ActionId::new("action");
    let action = ActionState::new(action_id.clone(), turn_id.clone(), ActionKind::Command);
    engine
        .apply_event(EngineEvent::ActionObserved {
            conversation_id: conversation_id.clone(),
            action,
        })
        .expect("action");

    let elicitation_id = ElicitationId::new("approval");
    let mut elicitation = ElicitationState::new(
        elicitation_id.clone(),
        RemoteRequestId::Codex(JsonRpcRequestId::new("request")),
        ElicitationKind::Approval,
    );
    elicitation.turn_id = Some(turn_id.clone());
    elicitation.action_id = Some(action_id.clone());
    engine
        .apply_event(EngineEvent::ElicitationOpened {
            conversation_id: conversation_id.clone(),
            elicitation,
        })
        .expect("open");

    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert!(matches!(
        conversation.actions.get(&action_id).unwrap().phase,
        ActionPhase::AwaitingDecision { .. }
    ));
    assert!(matches!(
        conversation.turns.get(&turn_id).unwrap().phase,
        TurnPhase::AwaitingUser { .. }
    ));

    engine
        .apply_event(EngineEvent::ElicitationResolved {
            conversation_id: conversation_id.clone(),
            elicitation_id: elicitation_id.clone(),
            decision: ElicitationDecision::Allow,
        })
        .expect("resolve");
    let conversation = engine.conversations.get(&conversation_id).unwrap();
    assert_eq!(
        conversation.actions.get(&action_id).unwrap().phase,
        ActionPhase::Running
    );
    assert!(matches!(
        conversation
            .elicitations
            .get(&elicitation_id)
            .unwrap()
            .phase,
        ElicitationPhase::Resolved { .. }
    ));
}

#[test]
fn resolve_elicitation_encodes_user_answers() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::CodexThread("thread".to_string()),
        adapter.capabilities(),
    );
    let elicitation_id = ElicitationId::new("input");
    engine
        .apply_event(EngineEvent::ElicitationOpened {
            conversation_id: conversation_id.clone(),
            elicitation: ElicitationState::new(
                elicitation_id.clone(),
                RemoteRequestId::Codex(JsonRpcRequestId::new("request")),
                ElicitationKind::UserInput,
            ),
        })
        .expect("open");

    let plan = engine
        .plan_command(EngineCommand::ResolveElicitation {
            conversation_id,
            elicitation_id,
            decision: ElicitationDecision::Answers(vec![
                UserAnswer {
                    id: "choice".to_string(),
                    value: "first".to_string(),
                },
                UserAnswer {
                    id: "choice".to_string(),
                    value: "second".to_string(),
                },
            ]),
        })
        .expect("resolve");

    let fields = &plan.effects[0].payload.fields;
    assert_eq!(fields.get("decision"), Some(&"Answers".to_string()));
    assert_eq!(fields.get("answerCount"), Some(&"2".to_string()));
    assert_eq!(fields.get("answer.0.id"), Some(&"choice".to_string()));
    assert_eq!(fields.get("answer.0.value"), Some(&"first".to_string()));
    assert_eq!(fields.get("answer.1.id"), Some(&"choice".to_string()));
    assert_eq!(fields.get("answer.1.value"), Some(&"second".to_string()));
}
