use std::process::ExitCode;
use std::time::{Duration, Instant};

use angel_engine_client::{
    AngelClient, ClientError, ClientResult, ClientUpdate, RuntimeOptionsOverrides,
    StartConversationRequest, TurnSnapshot, create_runtime_options,
};
use clap::Parser;

fn main() -> ExitCode {
    let config = CliConfig::parse();
    match run(&config) {
        Ok(output) => {
            println!("{output}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn run(config: &CliConfig) -> ClientResult<String> {
    let mut client = AngelClient::spawn(config.client_options()?)?;
    let result = run_prompt(&mut client, config);
    client.close();
    result
}

#[derive(Parser)]
#[command(
    name = "angel",
    about = "Runs one engine-normalized prompt and prints the final assistant text."
)]
struct CliConfig {
    #[arg(long)]
    runtime: String,
    #[arg(long)]
    prompt: String,
    #[arg(long)]
    cwd: Option<String>,
}

impl CliConfig {
    fn client_options(&self) -> ClientResult<angel_engine_client::ClientOptions> {
        let overrides = RuntimeOptionsOverrides {
            cwd: self.cwd.clone(),
            client_name: Some("angel-runner".to_string()),
            client_title: Some("Angel Runner".to_string()),
            ..RuntimeOptionsOverrides::default()
        };
        Ok(create_runtime_options(Some(&self.runtime), overrides)?.client_options())
    }
}

fn run_prompt(client: &mut AngelClient, config: &CliConfig) -> ClientResult<String> {
    client.initialize()?;
    let started = client.start_conversation(StartConversationRequest {
        cwd: config.cwd.clone(),
        additional_directories: Vec::new(),
    })?;
    let conversation_id = started
        .conversation_id
        .ok_or_else(|| invalid_input("runtime did not return a conversation id"))?;
    let command = client.send_text(conversation_id.clone(), config.prompt.clone())?;
    let turn_id = command
        .turn_id
        .ok_or_else(|| invalid_input("runtime did not return a turn id"))?;
    wait_for_turn_terminal(client, &conversation_id, &turn_id, Duration::from_secs(120))?;
    let turn = turn_snapshot(client, &conversation_id, &turn_id)
        .ok_or_else(|| invalid_input("runtime did not return a completed turn"))?;
    if !turn.is_terminal {
        return Err(invalid_input("runtime turn is not terminal"));
    }
    if !is_success(&turn) {
        return Err(invalid_input("runtime turn did not succeed"));
    }
    Ok(turn.output_text)
}

fn wait_for_turn_terminal(
    client: &mut AngelClient,
    conversation_id: &str,
    turn_id: &str,
    timeout: Duration,
) -> ClientResult<ClientUpdate> {
    let started = Instant::now();
    let mut update = ClientUpdate::default();
    while !client.turn_is_terminal(conversation_id, turn_id) {
        if started.elapsed() >= timeout {
            return Err(ClientError::Timeout {
                message: format!(
                    "turn {turn_id} did not finish within {}s",
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

fn turn_snapshot(
    client: &AngelClient,
    conversation_id: &str,
    turn_id: &str,
) -> Option<TurnSnapshot> {
    client
        .snapshot()
        .conversations
        .into_iter()
        .find(|conversation| conversation.id == conversation_id)
        .and_then(|conversation| {
            conversation
                .turns
                .into_iter()
                .find(|turn| turn.id == turn_id)
        })
}

fn is_success(turn: &TurnSnapshot) -> bool {
    turn.outcome.as_deref() == Some("Succeeded")
}

fn invalid_input(message: impl Into<String>) -> ClientError {
    ClientError::InvalidInput {
        message: message.into(),
    }
}
