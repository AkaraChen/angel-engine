use std::collections::BTreeSet;

use serde_json::json;

use super::{
    DisplayMessagePart, DisplayMessageRole, DisplayTextPartKind, conversation_display_messages,
};
use crate::{
    ActionId, ActionKind, ActionOutputDelta, ActionPhase, ActionState, ContentDelta, ContentPart,
    ConversationCapabilities, ConversationId, ConversationLifecycle, ConversationState,
    HistoryReplayEntry, HistoryReplayToolAction, HistoryRole, PlanDisplayKind, PlanEntry,
    PlanEntryStatus, PlanState, RemoteConversationId, RemoteTurnId, TurnDisplayContentKind,
    TurnDisplayPart, TurnId, TurnState, UserImageInputRef, UserInputRef,
};

#[test]
fn hydrated_history_projects_neutral_tool_parts() {
    let mut conversation = conversation(ConversationCapabilities::unknown());
    conversation.history.replay = vec![
        HistoryReplayEntry {
            role: HistoryRole::User,
            content: ContentDelta::Text("status".to_string()),
            tool: None,
        },
        HistoryReplayEntry {
            role: HistoryRole::Tool,
            content: ContentDelta::Text(String::new()),
            tool: Some(HistoryReplayToolAction {
                id: Some("call_1".to_string()),
                kind: Some(ActionKind::Command),
                phase: ActionPhase::Running,
                title: Some("git status".to_string()),
                input_summary: Some("git status -sb".to_string()),
                raw_input: Some("git status -sb".to_string()),
                output: Vec::new(),
                error: None,
            }),
        },
        HistoryReplayEntry {
            role: HistoryRole::Tool,
            content: ContentDelta::Text(String::new()),
            tool: Some(HistoryReplayToolAction {
                id: Some("call_1".to_string()),
                kind: Some(ActionKind::Command),
                phase: ActionPhase::Completed,
                title: Some("git status".to_string()),
                input_summary: None,
                raw_input: None,
                output: vec![ActionOutputDelta::Text("## main\n".to_string())],
                error: None,
            }),
        },
        HistoryReplayEntry {
            role: HistoryRole::Assistant,
            content: ContentDelta::Text("done".to_string()),
            tool: None,
        },
    ];

    let messages = conversation_display_messages(&conversation);

    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].role, DisplayMessageRole::User);
    assert!(matches!(
        messages[0].content.as_slice(),
        [DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text }]
            if text == "status"
    ));

    let assistant = &messages[1];
    let tool = assistant
        .content
        .iter()
        .find_map(|part| match part {
            DisplayMessagePart::ToolCall { action } => Some(action),
            DisplayMessagePart::Text { .. } => None,
            DisplayMessagePart::Image { .. } => None,
            DisplayMessagePart::File { .. } => None,
            DisplayMessagePart::Plan { .. } => None,
        })
        .expect("tool action");
    assert_eq!(tool.id, "call_1");
    assert_eq!(
        tool.turn_id.as_ref().map(ToString::to_string),
        Some(assistant.id.clone())
    );
    assert_eq!(tool.title.as_deref(), Some("git status"));
    assert_eq!(tool.kind, Some(ActionKind::Command));
    assert_eq!(tool.phase, ActionPhase::Completed);
    assert_eq!(tool.output_text, "## main\n");
    assert!(matches!(
        assistant.content.last(),
        Some(DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text })
            if text == "done"
    ));
}

#[test]
fn hydrated_history_message_ids_are_unique_for_interleaved_entries() {
    let mut conversation = conversation(ConversationCapabilities::unknown());
    conversation.history.replay = vec![
        HistoryReplayEntry {
            role: HistoryRole::Assistant,
            content: ContentDelta::Text("first answer".to_string()),
            tool: None,
        },
        HistoryReplayEntry {
            role: HistoryRole::User,
            content: ContentDelta::Text("next prompt".to_string()),
            tool: None,
        },
        HistoryReplayEntry {
            role: HistoryRole::Tool,
            content: ContentDelta::Text(String::new()),
            tool: Some(HistoryReplayToolAction {
                id: Some("call_1".to_string()),
                kind: Some(ActionKind::Command),
                phase: ActionPhase::Completed,
                title: Some("pwd".to_string()),
                input_summary: None,
                raw_input: None,
                output: Vec::new(),
                error: None,
            }),
        },
    ];

    let messages = conversation_display_messages(&conversation);
    let ids = messages
        .iter()
        .map(|message| message.id.as_str())
        .collect::<BTreeSet<_>>();

    assert_eq!(messages.len(), 3);
    assert_eq!(ids.len(), messages.len());
    assert_eq!(messages[0].id, "history-0");
    assert_eq!(messages[1].id, "history-1");
    assert_eq!(messages[2].id, "history-2");
}

#[test]
#[should_panic(expected = "history tool replay entry must include tool action")]
fn hydrated_history_rejects_tool_entry_without_tool_action() {
    let mut conversation = conversation(ConversationCapabilities::unknown());
    conversation.history.replay = vec![
        HistoryReplayEntry {
            role: HistoryRole::User,
            content: ContentDelta::Text("run tests".to_string()),
            tool: None,
        },
        HistoryReplayEntry {
            role: HistoryRole::Tool,
            content: ContentDelta::Text("npm test".to_string()),
            tool: None,
        },
    ];

    let _ = conversation_display_messages(&conversation);
}

#[test]
fn hydrated_history_projects_missing_tool_title_from_kind() {
    let mut conversation = conversation(ConversationCapabilities::unknown());
    conversation.history.replay = vec![
        HistoryReplayEntry {
            role: HistoryRole::User,
            content: ContentDelta::Text("search".to_string()),
            tool: None,
        },
        HistoryReplayEntry {
            role: HistoryRole::Tool,
            content: ContentDelta::Text(String::new()),
            tool: Some(HistoryReplayToolAction {
                id: Some("call_1".to_string()),
                kind: Some(ActionKind::WebSearch),
                phase: ActionPhase::Completed,
                title: None,
                input_summary: None,
                raw_input: None,
                output: Vec::new(),
                error: None,
            }),
        },
    ];

    let messages = conversation_display_messages(&conversation);

    let tool = match &messages[1].content[0] {
        DisplayMessagePart::ToolCall { action } => action,
        DisplayMessagePart::Text { .. } => panic!("expected tool action"),
        DisplayMessagePart::Image { .. } => panic!("expected tool action"),
        DisplayMessagePart::File { .. } => panic!("expected tool action"),
        DisplayMessagePart::Plan { .. } => panic!("expected tool action"),
    };
    assert_eq!(tool.title.as_deref(), Some("Web search"));
    assert_eq!(
        tool.turn_id.as_ref().map(ToString::to_string),
        Some(messages[1].id.clone())
    );
}

#[test]
fn hydrated_history_keeps_review_plan_and_todo_plan_separate() {
    let mut conversation = conversation(ConversationCapabilities::unknown());
    conversation.history.replay = vec![
        HistoryReplayEntry {
            role: HistoryRole::Assistant,
            content: ContentDelta::Structured(
                json!({
                    "type": "plan",
                    "kind": "review",
                    "entries": [{"content": "Review theme options", "status": "pending"}],
                    "text": "Review theme options"
                })
                .to_string(),
            ),
            tool: None,
        },
        HistoryReplayEntry {
            role: HistoryRole::Assistant,
            content: ContentDelta::Structured(
                json!({
                    "type": "plan",
                    "kind": "todo",
                    "entries": [{"content": "Apply blue theme", "status": "completed"}]
                })
                .to_string(),
            ),
            tool: None,
        },
    ];

    let messages = conversation_display_messages(&conversation);

    assert_eq!(messages.len(), 1);
    assert!(matches!(
        messages[0].content.as_slice(),
        [
            DisplayMessagePart::Plan { kind: PlanDisplayKind::Review, entries: review, .. },
            DisplayMessagePart::Plan { kind: PlanDisplayKind::Todo, entries: todo, .. },
        ] if review[0].content == "Review theme options"
            && review[0].status == PlanEntryStatus::Pending
            && todo[0].content == "Apply blue theme"
            && todo[0].status == PlanEntryStatus::Completed
    ));
}

#[test]
fn live_turn_projects_same_message_shape() {
    let mut conversation = conversation(ConversationCapabilities::unknown());
    let turn_id = TurnId::new("turn-1");
    let mut turn = TurnState::new(
        turn_id.clone(),
        RemoteTurnId::Known("remote-turn-1".to_string()),
        0,
    );
    turn.input.push(UserInputRef {
        content: "status".to_string(),
        file: None,
        image: None,
        reference: false,
    });
    turn.input.push(UserInputRef {
        content: "skill-authoring".to_string(),
        file: None,
        image: None,
        reference: true,
    });
    turn.reasoning
        .chunks
        .push(ContentDelta::Text("thinking".to_string()));
    turn.output
        .chunks
        .push(ContentDelta::Text("done".to_string()));
    conversation.turns.insert(turn_id.clone(), turn);

    let mut action = ActionState::new(
        ActionId::new("call_1"),
        turn_id.clone(),
        ActionKind::Command,
    );
    action.phase = ActionPhase::Completed;
    action.title = Some("git status".to_string());
    action
        .output
        .chunks
        .push(ActionOutputDelta::Text("## main\n".to_string()));
    conversation.actions.insert(action.id.clone(), action);

    let messages = conversation_display_messages(&conversation);

    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].role, DisplayMessageRole::User);
    assert!(matches!(
        messages[0].content.as_slice(),
        [DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text }]
            if text == "status"
    ));
    assert_eq!(messages[1].id, "turn-1:assistant");
    assert!(matches!(
        messages[1].content.as_slice(),
        [
            DisplayMessagePart::Text { kind: DisplayTextPartKind::Reasoning, text: reasoning },
            DisplayMessagePart::ToolCall { action },
            DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text }
        ] if reasoning == "thinking"
            && action.id == "call_1"
            && action.output_text == "## main\n"
            && text == "done"
    ));
}

#[test]
fn live_turn_projects_plan_as_independent_part() {
    let mut conversation = conversation(ConversationCapabilities::unknown());
    let turn_id = TurnId::new("turn-1");
    let mut turn = TurnState::new(
        turn_id.clone(),
        RemoteTurnId::Known("remote-turn-1".to_string()),
        0,
    );
    turn.reasoning
        .chunks
        .push(ContentDelta::Text("thinking".to_string()));
    turn.plan_text
        .chunks
        .push(ContentDelta::Text("draft plan".to_string()));
    turn.plan_path = Some("/tmp/plan.md".to_string());
    turn.plan = Some(PlanState {
        entries: vec![
            PlanEntry {
                content: "Inspect protocol".to_string(),
                status: PlanEntryStatus::Completed,
            },
            PlanEntry {
                content: "Implement UI".to_string(),
                status: PlanEntryStatus::InProgress,
            },
        ],
    });
    turn.output
        .chunks
        .push(ContentDelta::Text("done".to_string()));
    conversation.turns.insert(turn_id, turn);

    let messages = conversation_display_messages(&conversation);

    assert_eq!(messages.len(), 1);
    assert!(matches!(
        messages[0].content.as_slice(),
        [
            DisplayMessagePart::Text { kind: DisplayTextPartKind::Reasoning, text: reasoning },
            DisplayMessagePart::Plan { entries, text: plan_text, path, .. },
            DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text }
        ] if reasoning == "thinking"
            && entries.len() == 2
            && entries[0].content == "Inspect protocol"
            && entries[0].status == PlanEntryStatus::Completed
            && plan_text == "draft plan"
            && path.as_deref() == Some("/tmp/plan.md")
            && text == "done"
    ));
}

#[test]
fn live_turn_preserves_whitespace_only_stream_chunks() {
    // Token-level streaming can emit whitespace as standalone chunks (the
    // newline after a code-fence language tag, single spaces between words).
    // The ordered display path must fold consecutive chunks instead of
    // treating each whitespace-only chunk as an empty part.
    let mut conversation = conversation(ConversationCapabilities::unknown());
    let turn_id = TurnId::new("turn-1");
    let mut turn = TurnState::new(
        turn_id.clone(),
        RemoteTurnId::Known("remote-turn-1".to_string()),
        0,
    );
    for (chunk_index, text) in ["```", "python", "\n", "x", " =", " ", "1", "\n", "```"]
        .into_iter()
        .enumerate()
    {
        turn.output
            .chunks
            .push(ContentDelta::Text(text.to_string()));
        turn.display_parts.push(TurnDisplayPart::Content {
            kind: TurnDisplayContentKind::Assistant,
            chunk_index,
        });
    }
    conversation.turns.insert(turn_id, turn);

    let messages = conversation_display_messages(&conversation);

    assert_eq!(messages.len(), 1);
    assert!(matches!(
        messages[0].content.as_slice(),
        [DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text }]
            if text == "```python\nx = 1\n```"
    ));
}

#[test]
fn live_turn_projects_image_input_parts() {
    let mut conversation = conversation(ConversationCapabilities::unknown());
    let turn_id = TurnId::new("turn-1");
    let mut turn = TurnState::new(
        turn_id.clone(),
        RemoteTurnId::Known("remote-turn-1".to_string()),
        0,
    );
    turn.input.push(UserInputRef {
        content: "describe this".to_string(),
        file: None,
        image: None,
        reference: false,
    });
    turn.input.push(UserInputRef {
        content: "sample.png".to_string(),
        file: None,
        image: Some(UserImageInputRef {
            data: "ZmFrZQ==".to_string(),
            mime_type: "image/png".to_string(),
            name: Some("sample.png".to_string()),
        }),
        reference: false,
    });
    conversation.turns.insert(turn_id, turn);

    let messages = conversation_display_messages(&conversation);

    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].role, DisplayMessageRole::User);
    assert!(matches!(
        messages[0].content.as_slice(),
        [
            DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text },
            DisplayMessagePart::Image { data, mime_type, name }
        ] if text == "describe this"
            && data == "ZmFrZQ=="
            && mime_type == "image/png"
            && name.as_deref() == Some("sample.png")
    ));
}

#[test]
fn hydrated_history_projects_image_parts() {
    let mut conversation = conversation(ConversationCapabilities::unknown());
    conversation.history.replay = vec![HistoryReplayEntry {
        role: HistoryRole::User,
        content: ContentDelta::Parts(vec![
            ContentPart::text("look"),
            ContentPart::image("ZmFrZQ==", "image/png", Some("sample.png".to_string())),
        ]),
        tool: None,
    }];

    let messages = conversation_display_messages(&conversation);

    assert_eq!(messages.len(), 1);
    assert!(matches!(
        messages[0].content.as_slice(),
        [
            DisplayMessagePart::Text { kind: DisplayTextPartKind::Text, text },
            DisplayMessagePart::Image { data, mime_type, name }
        ] if text == "look"
            && data == "ZmFrZQ=="
            && mime_type == "image/png"
            && name.as_deref() == Some("sample.png")
    ));
}

fn conversation(capabilities: ConversationCapabilities) -> ConversationState {
    ConversationState::new(
        ConversationId::new("conversation-1"),
        RemoteConversationId::Known("remote-conversation-1".to_string()),
        ConversationLifecycle::Idle,
        capabilities,
    )
}
