use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use angel_engine_client::{
    AngelClient, ClientError, ClientResult, ClientUpdate, ConversationSnapshot, RuntimeSnapshot,
    StartConversationRequest,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProfileRequest {
    pub cwd: Option<String>,
    pub additional_directories: Vec<String>,
    pub message: Option<String>,
    pub message_timeout: Duration,
}

impl Default for ProfileRequest {
    fn default() -> Self {
        Self {
            cwd: None,
            additional_directories: Vec::new(),
            message: Some("Reply with exactly: profiler-ok".to_string()),
            message_timeout: Duration::from_secs(120),
        }
    }
}

impl ProfileRequest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cwd(mut self, cwd: impl Into<String>) -> Self {
        self.cwd = Some(cwd.into());
        self
    }

    pub fn additional_directory(mut self, directory: impl Into<String>) -> Self {
        self.additional_directories.push(directory.into());
        self
    }

    pub fn message(mut self, message: impl Into<String>) -> Self {
        self.message = Some(message.into());
        self
    }

    pub fn skip_message(mut self) -> Self {
        self.message = None;
        self
    }

    pub fn message_timeout(mut self, timeout: Duration) -> Self {
        self.message_timeout = timeout;
        self
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileReport {
    pub runtime: RuntimeInfo,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub steps: Vec<ProfileStep>,
}

impl ProfileReport {
    pub fn total_duration_ms(&self) -> f64 {
        self.steps
            .iter()
            .filter(|step| {
                step.status == ProfileStepStatus::Ok && step.name != "send_message_total"
            })
            .map(|step| step.duration_ms)
            .sum()
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStep {
    pub name: String,
    pub duration_ms: f64,
    pub status: ProfileStepStatus,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub details: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProfileStepStatus {
    Ok,
    Failed,
    Skipped,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAttempt {
    pub report: ProfileReport,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ProfileAttempt {
    pub fn is_ok(&self) -> bool {
        self.error.is_none()
    }
}

pub fn profile_spawned_client(
    options: angel_engine_client::ClientOptions,
    request: ProfileRequest,
) -> ClientResult<ProfileReport> {
    let mut report = ProfileReport::default();
    let mut client = timed_step(
        &mut report,
        "spawn_process",
        || AngelClient::spawn(options),
        |_| BTreeMap::new(),
    )?;
    let profile_result = profile_client_into(&mut client, request, &mut report);
    client.close();
    profile_result?;
    Ok(report)
}

pub fn profile_spawned_client_attempt(
    options: angel_engine_client::ClientOptions,
    request: ProfileRequest,
) -> ProfileAttempt {
    let mut report = ProfileReport::default();
    let mut client = match timed_step(
        &mut report,
        "spawn_process",
        || AngelClient::spawn(options),
        |_| BTreeMap::new(),
    ) {
        Ok(client) => client,
        Err(error) => {
            return ProfileAttempt {
                report,
                error: Some(error.to_string()),
            };
        }
    };

    let result = profile_client_into(&mut client, request, &mut report);
    client.close();
    ProfileAttempt {
        report,
        error: result.err().map(|error| error.to_string()),
    }
}

pub fn profile_client(
    client: &mut AngelClient,
    request: ProfileRequest,
) -> ClientResult<ProfileReport> {
    let mut report = ProfileReport::default();
    profile_client_into(client, request, &mut report)?;
    Ok(report)
}

fn profile_client_into(
    client: &mut AngelClient,
    request: ProfileRequest,
    report: &mut ProfileReport,
) -> ClientResult<()> {
    let initialize_update =
        timed_step(report, "initialize", || client.initialize(), update_details)?;
    fail_on_runtime_fault(&initialize_update)?;
    report.runtime = runtime_info(&client.snapshot().runtime);

    let start_request = StartConversationRequest {
        cwd: request.cwd,
        additional_directories: request.additional_directories,
    };
    let start_result = timed_step(
        report,
        "start_thread",
        || client.start_conversation(start_request),
        |result| {
            let mut details = update_details(&result.update);
            if let Some(conversation_id) = &result.conversation_id {
                details.insert("conversationId".to_string(), conversation_id.clone());
            }
            details
        },
    )?;
    fail_on_runtime_fault(&start_result.update)?;

    let conversation_id = start_result
        .conversation_id
        .ok_or_else(|| invalid_input("start_thread did not return a conversation id"))?;
    report.conversation_id = Some(conversation_id.clone());

    if let Some(conversation) = conversation_snapshot(client, &conversation_id) {
        add_step(
            report,
            ProfileStep {
                name: "thread_snapshot".to_string(),
                duration_ms: 0.0,
                status: ProfileStepStatus::Ok,
                details: conversation_details(&conversation),
                error: None,
            },
        );
    }

    timed_step(
        report,
        "get_thread_settings",
        || client.thread_settings(conversation_id.clone()),
        |settings| {
            let mut details = BTreeMap::new();
            details.insert(
                "models".to_string(),
                settings.model_list.available_models.len().to_string(),
            );
            details.insert(
                "modes".to_string(),
                settings.available_modes.available_modes.len().to_string(),
            );
            details.insert(
                "reasoningLevels".to_string(),
                settings.reasoning_level.available_levels.len().to_string(),
            );
            details
        },
    )?;

    timed_step(
        report,
        "get_model_list",
        || client.model_list(conversation_id.clone()),
        |models| {
            let mut details = BTreeMap::new();
            details.insert(
                "count".to_string(),
                models.available_models.len().to_string(),
            );
            details.insert("canSet".to_string(), models.can_set.to_string());
            if let Some(model) = &models.current_model_id {
                details.insert("current".to_string(), model.clone());
            }
            if !models.available_models.is_empty() {
                details.insert(
                    "sample".to_string(),
                    models
                        .available_models
                        .iter()
                        .take(5)
                        .map(|model| model.id.as_str())
                        .collect::<Vec<_>>()
                        .join(", "),
                );
            }
            details
        },
    )?;

    timed_step(
        report,
        "get_available_modes",
        || client.available_modes(conversation_id.clone()),
        |modes| {
            let mut details = BTreeMap::new();
            details.insert("count".to_string(), modes.available_modes.len().to_string());
            details.insert("canSet".to_string(), modes.can_set.to_string());
            if let Some(mode) = &modes.current_mode_id {
                details.insert("current".to_string(), mode.clone());
            }
            details
        },
    )?;

    timed_step(
        report,
        "get_reasoning_level",
        || client.reasoning_level(conversation_id.clone()),
        |reasoning| {
            let mut details = BTreeMap::new();
            details.insert(
                "count".to_string(),
                reasoning.available_levels.len().to_string(),
            );
            details.insert("canSet".to_string(), reasoning.can_set.to_string());
            details.insert("source".to_string(), reasoning.source.clone());
            if let Some(level) = &reasoning.current_level {
                details.insert("current".to_string(), level.clone());
            }
            details
        },
    )?;

    if let Some(message) = request.message {
        let total_start = Instant::now();
        let command = timed_step(
            report,
            "send_message_command",
            || client.send_text(conversation_id.clone(), message),
            |result| {
                let mut details = update_details(&result.update);
                if let Some(turn_id) = &result.turn_id {
                    details.insert("turnId".to_string(), turn_id.clone());
                }
                details
            },
        )?;
        fail_on_runtime_fault(&command.update)?;

        if let Some(turn_id) = command.turn_id {
            report.turn_id = Some(turn_id.clone());
            let terminal_update = timed_step(
                report,
                "wait_message_terminal",
                || {
                    wait_for_turn_terminal_with_timeout(
                        client,
                        &conversation_id,
                        &turn_id,
                        request.message_timeout,
                    )
                },
                update_details,
            )?;
            fail_on_runtime_fault(&terminal_update)?;

            let mut details = BTreeMap::new();
            details.insert("turnId".to_string(), turn_id.clone());
            if let Some(turn) = find_turn(client, &conversation_id, &turn_id) {
                details.insert(
                    "outputChars".to_string(),
                    turn.output_text.chars().count().to_string(),
                );
                if let Some(outcome) = turn.outcome {
                    details.insert("outcome".to_string(), outcome);
                }
            }
            add_step(
                report,
                ProfileStep {
                    name: "send_message_total".to_string(),
                    duration_ms: elapsed_ms(total_start.elapsed()),
                    status: ProfileStepStatus::Ok,
                    details,
                    error: None,
                },
            );
        } else {
            add_step(
                report,
                ProfileStep {
                    name: "wait_message_terminal".to_string(),
                    duration_ms: 0.0,
                    status: ProfileStepStatus::Skipped,
                    details: BTreeMap::from([(
                        "reason".to_string(),
                        "send_text did not produce a turn id".to_string(),
                    )]),
                    error: None,
                },
            );
        }
    } else {
        add_step(
            report,
            ProfileStep {
                name: "send_message_command".to_string(),
                duration_ms: 0.0,
                status: ProfileStepStatus::Skipped,
                details: BTreeMap::from([("reason".to_string(), "message skipped".to_string())]),
                error: None,
            },
        );
    }

    Ok(())
}

fn timed_step<T>(
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

fn add_step(report: &mut ProfileReport, step: ProfileStep) {
    report.steps.push(step);
}

fn elapsed_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

fn wait_for_turn_terminal_with_timeout(
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

fn turn_is_terminal(client: &AngelClient, conversation_id: &str, turn_id: &str) -> bool {
    find_turn(client, conversation_id, turn_id)
        .map(|turn| turn.phase.contains("terminal"))
        .unwrap_or(false)
}

fn find_turn(
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

fn conversation_snapshot(
    client: &AngelClient,
    conversation_id: &str,
) -> Option<ConversationSnapshot> {
    client
        .snapshot()
        .conversations
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
}

fn runtime_info(runtime: &RuntimeSnapshot) -> RuntimeInfo {
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

fn update_details(update: &ClientUpdate) -> BTreeMap<String, String> {
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

fn conversation_details(conversation: &ConversationSnapshot) -> BTreeMap<String, String> {
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

fn fail_on_runtime_fault(update: &ClientUpdate) -> ClientResult<()> {
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

fn invalid_input(message: impl Into<String>) -> ClientError {
    ClientError::InvalidInput {
        message: message.into(),
    }
}
