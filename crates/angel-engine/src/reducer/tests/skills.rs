use crate::command::{EngineCommand, EngineExtensionCommand, TurnOverrides, UserInput};
use crate::event::EngineEvent;
use crate::ids::RemoteConversationId;
use crate::protocol::ProtocolFlavor;
use crate::state::{Skill, SkillScope};
use crate::{EngineError, ProtocolMethod};

use super::{acp_capabilities, codex_capabilities, engine_with, insert_ready_conversation};

#[test]
fn refresh_skills_emits_list_skills_effect_when_supported() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );

    let plan = engine
        .plan_command(EngineCommand::Extension(
            EngineExtensionCommand::RefreshSkills {
                conversation_id: conversation_id.clone(),
                force_reload: true,
            },
        ))
        .expect("refresh skills plan");

    assert_eq!(plan.effects.len(), 1);
    assert!(matches!(plan.effects[0].method, ProtocolMethod::ListSkills));
    assert_eq!(
        plan.effects[0].payload.fields.get("forceReload"),
        Some(&"true".to_string())
    );
}

#[test]
fn refresh_skills_requires_capability() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("session".to_string()),
        capabilities,
    );

    let result = engine.plan_command(EngineCommand::Extension(
        EngineExtensionCommand::RefreshSkills {
            conversation_id,
            force_reload: false,
        },
    ));

    assert!(matches!(
        result,
        Err(EngineError::CapabilityUnsupported { .. })
    ));
}

#[test]
fn session_skills_updated_populates_conversation_state() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );

    engine
        .apply_event(EngineEvent::SessionSkillsUpdated {
            conversation_id: conversation_id.clone(),
            skills: vec![Skill {
                name: "skill-authoring".to_string(),
                description: "Create and validate skills".to_string(),
                path: "/home/user/.agents/skills/skill-authoring/SKILL.md".to_string(),
                scope: SkillScope::User,
                enabled: true,
            }],
        })
        .expect("apply skills update");

    let conversation = engine
        .conversations
        .get(&conversation_id)
        .expect("conversation");
    assert_eq!(conversation.available_skills.len(), 1);
    assert_eq!(conversation.available_skills[0].name, "skill-authoring");
    assert_eq!(conversation.available_skills[0].scope, SkillScope::User);
}

#[test]
fn start_turn_with_skill_mention_requires_capability() {
    let capabilities = acp_capabilities();
    let mut engine = engine_with(ProtocolFlavor::Acp, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("session".to_string()),
        capabilities,
    );

    let result = engine.plan_command(EngineCommand::StartTurn {
        conversation_id,
        input: vec![
            UserInput::skill_mention("skill-authoring", "/path/to/SKILL.md"),
            UserInput::text("use this skill"),
        ],
        overrides: TurnOverrides::default(),
    });

    assert!(matches!(
        result,
        Err(EngineError::CapabilityUnsupported { .. })
    ));
}

#[test]
fn start_turn_with_skill_mention_encodes_effect_fields() {
    let capabilities = codex_capabilities();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, capabilities.clone());
    let conversation_id = insert_ready_conversation(
        &mut engine,
        "conv",
        RemoteConversationId::Known("thread".to_string()),
        capabilities,
    );

    let plan = engine
        .plan_command(EngineCommand::StartTurn {
            conversation_id,
            input: vec![
                UserInput::skill_mention("skill-authoring", "/path/to/SKILL.md"),
                UserInput::text("use this skill"),
            ],
            overrides: TurnOverrides::default(),
        })
        .expect("start turn with skill mention");

    let fields = &plan.effects[0].payload.fields;
    assert_eq!(
        fields.get("input.0.type"),
        Some(&"skill_mention".to_string())
    );
    assert_eq!(
        fields.get("input.0.name"),
        Some(&"skill-authoring".to_string())
    );
    assert_eq!(
        fields.get("input.0.path"),
        Some(&"/path/to/SKILL.md".to_string())
    );
    assert_eq!(fields.get("input.1.type"), Some(&"text".to_string()));
}
