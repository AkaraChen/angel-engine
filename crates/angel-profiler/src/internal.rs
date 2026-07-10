use super::*;

pub(super) fn timed_step<T>(
    report: &mut ProfileReport,
    name: &str,
    action: impl FnOnce() -> ClientResult<T>,
    details: impl FnOnce(&T) -> BTreeMap<String, String>,
) -> ClientResult<T> {
    let start = Instant::now();
    match action() {
        Ok(value) => {
            add_step(
                report,
                ProfileStep {
                    name: name.to_string(),
                    duration_ms: elapsed_ms(start.elapsed()),
                    status: ProfileStepStatus::Ok,
                    details: details(&value),
                    error: None,
                },
            );
            Ok(value)
        }
        Err(error) => {
            add_step(
                report,
                ProfileStep {
                    name: name.to_string(),
                    duration_ms: elapsed_ms(start.elapsed()),
                    status: ProfileStepStatus::Failed,
                    details: BTreeMap::new(),
                    error: Some(error.to_string()),
                },
            );
            Err(error)
        }
    }
}

pub(super) fn add_step(report: &mut ProfileReport, step: ProfileStep) {
    report.steps.push(step);
}

pub(super) fn elapsed_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

pub(super) fn wait_for_turn_terminal_with_timeout(
    client: &mut AngelClient,
    conversation_id: &str,
    turn_id: &str,
    timeout: Duration,
) -> ClientResult<ClientUpdate> {
    let start = Instant::now();
    let mut update = ClientUpdate::default();
    while !turn_is_terminal(client, conversation_id, turn_id) {
        if start.elapsed() >= timeout {
            return Err(ClientError::Timeout {
                message: format!(
                    "turn {turn_id} did not reach a terminal phase within {}s",
                    timeout.as_secs()
                ),
            });
        }
        match client.next_update(Some(Duration::from_millis(250)))? {
            Some(next) => update.merge(next),
            None => continue,
        }
    }
    Ok(update)
}

pub(super) fn turn_is_terminal(client: &AngelClient, conversation_id: &str, turn_id: &str) -> bool {
    find_turn(client, conversation_id, turn_id)
        .map(|turn| turn.phase.contains("terminal"))
        .unwrap_or(false)
}

pub(super) fn find_turn(
    client: &AngelClient,
    conversation_id: &str,
    turn_id: &str,
) -> Option<angel_engine_client::TurnSnapshot> {
    conversation_snapshot(client, conversation_id).and_then(|conversation| {
        conversation
            .turns
            .into_iter()
            .find(|turn| turn.id == turn_id)
    })
}

pub(super) fn conversation_snapshot(
    client: &AngelClient,
    conversation_id: &str,
) -> Option<ConversationSnapshot> {
    client
        .snapshot()
        .conversations
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
}

pub(super) fn runtime_info(runtime: &RuntimeSnapshot) -> RuntimeInfo {
    match runtime {
        RuntimeSnapshot::Offline => RuntimeInfo {
            status: "offline".to_string(),
            ..RuntimeInfo::default()
        },
        RuntimeSnapshot::Connecting => RuntimeInfo {
            status: "connecting".to_string(),
            ..RuntimeInfo::default()
        },
        RuntimeSnapshot::Negotiating => RuntimeInfo {
            status: "negotiating".to_string(),
            ..RuntimeInfo::default()
        },
        RuntimeSnapshot::AwaitingAuth { .. } => RuntimeInfo {
            status: "awaitingAuth".to_string(),
            ..RuntimeInfo::default()
        },
        RuntimeSnapshot::Available { name, version, .. } => RuntimeInfo {
            status: "available".to_string(),
            name: Some(name.clone()),
            version: version.clone(),
        },
        RuntimeSnapshot::Faulted { code, message, .. } => RuntimeInfo {
            status: "faulted".to_string(),
            name: Some(code.clone()),
            version: Some(message.clone()),
        },
    }
}

pub(super) fn update_details(update: &ClientUpdate) -> BTreeMap<String, String> {
    BTreeMap::from([
        ("events".to_string(), update.events.len().to_string()),
        (
            "streamDeltas".to_string(),
            update.stream_deltas.len().to_string(),
        ),
        ("logs".to_string(), update.logs.len().to_string()),
        ("outgoing".to_string(), update.outgoing.len().to_string()),
        (
            "completedRequests".to_string(),
            update.completed_request_ids.len().to_string(),
        ),
    ])
}

pub(super) fn conversation_details(
    conversation: &ConversationSnapshot,
) -> BTreeMap<String, String> {
    let mut details = BTreeMap::new();
    details.insert("lifecycle".to_string(), conversation.lifecycle.clone());
    details.insert("remoteKind".to_string(), conversation.remote_kind.clone());
    if let Some(remote_id) = &conversation.remote_id {
        details.insert("remoteId".to_string(), remote_id.clone());
    }
    details.insert("turns".to_string(), conversation.turns.len().to_string());
    details.insert(
        "messages".to_string(),
        conversation.messages.len().to_string(),
    );
    details.insert(
        "availableCommands".to_string(),
        conversation.available_commands.len().to_string(),
    );
    details
}

pub(super) fn fail_on_runtime_fault(update: &ClientUpdate) -> ClientResult<()> {
    for event in &update.events {
        if let angel_engine_client::ClientEvent::RuntimeFaulted { code, message } = event {
            return Err(ClientError::RuntimeFaulted {
                code: code.clone(),
                message: message.clone(),
            });
        }
    }
    Ok(())
}

pub(super) fn invalid_input(message: impl Into<String>) -> ClientError {
    ClientError::InvalidInput {
        message: message.into(),
    }
}
