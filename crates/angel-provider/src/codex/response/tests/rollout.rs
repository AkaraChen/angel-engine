use super::super::history::append_local_rollout_history_content;
use super::super::*;

#[test]
fn rollout_history_ignores_event_user_message_channel() {
    let conversation_id = ConversationId::new("conv");
    let mut output = TransportOutput::default();
    let content = r##"{"timestamp":"2026-05-17T23:55:29.683Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\n  <cwd>/Users/akrc</cwd>\n  <shell>zsh</shell>\n  <current_date>2026-05-18</current_date>\n  <timezone>Asia/Shanghai</timezone>\n</environment_context>"}]}}
{"timestamp":"2026-05-17T23:55:29.700Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for /Users/akrc/Developer/angel-engine\n\n<INSTRUCTIONS>\nDo not display this.\n</INSTRUCTIONS>"},{"type":"input_text","text":"<environment_context>\n  <cwd>/Users/akrc/Developer/angel-engine</cwd>\n</environment_context>"}]}}
{"timestamp":"2026-05-17T23:55:29.750Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<turn_aborted>\nThe user interrupted the previous turn on purpose. Any running unified exec processes may still be running in the background. If any tools/commands were aborted, they may have partially executed.\n</turn_aborted>"}]}}
{"timestamp":"2026-05-17T23:55:29.782Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"你好"}]}}
{"timestamp":"2026-05-17T23:55:29.782Z","type":"event_msg","payload":{"type":"user_message","message":"你好","images":[],"local_images":[],"text_elements":[]}}
{"timestamp":"2026-05-17T23:55:31.725Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"你好。你想让我帮你处理什么？"}]}}"##;

    let has_local_history =
        append_local_rollout_history_content(&mut output, &conversation_id, content);
    let replay = output
        .events
        .iter()
        .filter_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
            _ => None,
        })
        .collect::<Vec<_>>();

    assert!(has_local_history);
    assert_eq!(replay.len(), 2);
    assert_eq!(replay[0].role, HistoryRole::User);
    assert!(matches!(
        &replay[0].content,
        ContentDelta::Text(text) if text == "你好"
    ));
    assert_eq!(replay[1].role, HistoryRole::Assistant);
}

#[test]
fn rollout_history_drops_event_user_message_without_response_item() {
    let conversation_id = ConversationId::new("conv");
    let mut output = TransportOutput::default();
    let content = r#"{"timestamp":"2026-05-17T23:55:29.782Z","type":"event_msg","payload":{"type":"user_message","message":"你好","images":[],"local_images":[],"text_elements":[]}}
{"timestamp":"2026-05-17T23:55:30.000Z","type":"event_msg","payload":{"type":"user_message","message":"你好","images":[],"local_images":[],"text_elements":[]}}"#;

    let has_local_history =
        append_local_rollout_history_content(&mut output, &conversation_id, content);
    let replay = output
        .events
        .iter()
        .filter(|event| matches!(event, EngineEvent::HistoryReplayChunk { .. }))
        .collect::<Vec<_>>();

    assert!(!has_local_history);
    assert_eq!(replay.len(), 0);
}

#[test]
fn rollout_history_filters_recommended_plugins_context_message() {
    let conversation_id = ConversationId::new("conv");
    let mut output = TransportOutput::default();
    let content = r##"{"timestamp":"2026-07-18T08:16:41.843Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<recommended_plugins>\nHere is a list of plugins that are available but not installed.\n\n- Box (box@openai-curated-remote)\n</recommended_plugins>"},{"type":"input_text","text":"<environment_context>\n  <cwd>/Users/akrc</cwd>\n</environment_context>"}]}}
{"timestamp":"2026-07-18T08:16:41.900Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<recommended_plugins>\nHere is a list of plugins that are available but not installed.\n</recommended_plugins>"}]}}
{"timestamp":"2026-07-18T08:16:42.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Reply with one code block."}]}}
{"timestamp":"2026-07-18T08:16:50.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"```python\nx = 1\n```"}]}}"##;

    let has_local_history =
        append_local_rollout_history_content(&mut output, &conversation_id, content);
    let replay = output
        .events
        .iter()
        .filter_map(|event| match event {
            EngineEvent::HistoryReplayChunk { entry, .. } => Some(entry),
            _ => None,
        })
        .collect::<Vec<_>>();

    assert!(has_local_history);
    assert_eq!(replay.len(), 2);
    assert_eq!(replay[0].role, HistoryRole::User);
    assert!(matches!(
        &replay[0].content,
        ContentDelta::Text(text) if text == "Reply with one code block."
    ));
    assert_eq!(replay[1].role, HistoryRole::Assistant);
}
