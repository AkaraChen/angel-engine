use std::env;
use std::error::Error;
use std::time::Duration;

use angel_engine_client::{ClientOptions, ClientProtocol};
use angel_profiler::{
    ProfileReport, ProfileRequest, ProfileStep, ProfileStepStatus, profile_spawned_client,
};

fn main() -> Result<(), Box<dyn Error>> {
    let config = CliConfig::parse(env::args().skip(1))?;
    let request = config.profile_request()?;
    let report = profile_spawned_client(config.client_options(), request)?;
    if config.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_report(&report);
    }
    Ok(())
}

#[derive(Debug)]
struct CliConfig {
    runtime: String,
    command: Option<String>,
    args: Vec<String>,
    cwd: Option<String>,
    message: Option<String>,
    skip_message: bool,
    message_timeout: Duration,
    need_auth: Option<bool>,
    json: bool,
}

impl CliConfig {
    fn parse(args: impl IntoIterator<Item = String>) -> Result<Self, String> {
        let mut config = Self {
            runtime: "kimi".to_string(),
            command: None,
            args: Vec::new(),
            cwd: None,
            message: Some("Reply with exactly: profiler-ok".to_string()),
            skip_message: false,
            message_timeout: Duration::from_secs(120),
            need_auth: None,
            json: false,
        };
        let mut runtime_set = false;
        let mut iter = args.into_iter();

        while let Some(arg) = iter.next() {
            match arg.as_str() {
                "-h" | "--help" => return Err(usage()),
                "--runtime" => {
                    config.runtime = next_value(&mut iter, "--runtime")?;
                    runtime_set = true;
                }
                "--command" => config.command = Some(next_value(&mut iter, "--command")?),
                "--arg" => config.args.push(next_value(&mut iter, "--arg")?),
                "--cwd" => config.cwd = Some(next_value(&mut iter, "--cwd")?),
                "--message" => config.message = Some(next_value(&mut iter, "--message")?),
                "--skip-message" => config.skip_message = true,
                "--message-timeout-secs" => {
                    let value = next_value(&mut iter, "--message-timeout-secs")?;
                    let secs = value
                        .parse::<u64>()
                        .map_err(|_| format!("invalid --message-timeout-secs value: {value}"))?;
                    config.message_timeout = Duration::from_secs(secs);
                }
                "--auth" => config.need_auth = Some(true),
                "--no-auth" => config.need_auth = Some(false),
                "--json" => config.json = true,
                value if value.starts_with('-') => {
                    return Err(format!("unknown option: {value}\n\n{}", usage()));
                }
                value => {
                    if runtime_set {
                        return Err(format!("unexpected positional argument: {value}"));
                    }
                    config.runtime = value.to_string();
                    runtime_set = true;
                }
            }
        }

        Ok(config)
    }

    fn client_options(&self) -> ClientOptions {
        let mut builder = ClientOptions::builder()
            .acp(self.command.clone().unwrap_or_else(|| self.runtime.clone()))
            .client_name("angel-profiler")
            .client_title("Angel Profiler");

        if self.command.is_none() {
            match self.runtime.as_str() {
                "kimi" => {
                    builder = builder
                        .arg("acp")
                        .args(self.args.clone())
                        .need_auth(true)
                        .auto_authenticate(true);
                }
                "opencode" | "open-code" => {
                    builder = builder
                        .command("opencode")
                        .arg("acp")
                        .args(self.args.clone())
                        .need_auth(false)
                        .auto_authenticate(false);
                }
                _ => {
                    builder = builder.args(self.args.clone());
                }
            }
        } else {
            builder = builder.args(self.args.clone());
        }

        if let Some(need_auth) = self.need_auth {
            builder = builder.need_auth(need_auth).auto_authenticate(need_auth);
        }
        if let Some(cwd) = &self.cwd {
            builder = builder.cwd(cwd.clone());
        }

        let mut options = builder.build();
        options.protocol = ClientProtocol::Acp;
        options
    }

    fn profile_request(&self) -> Result<ProfileRequest, String> {
        let mut request = ProfileRequest::new().message_timeout(self.message_timeout);
        if let Some(cwd) = &self.cwd {
            request = request.cwd(cwd.clone());
        }
        if self.skip_message {
            request = request.skip_message();
        } else if let Some(message) = &self.message {
            request = request.message(message.clone());
        }
        Ok(request)
    }
}

fn next_value(
    iter: &mut impl Iterator<Item = String>,
    option: &'static str,
) -> Result<String, String> {
    iter.next()
        .ok_or_else(|| format!("{option} requires a value"))
}

fn usage() -> String {
    [
        "Usage: angel-profiler [kimi|opencode] [options]",
        "",
        "Options:",
        "  --runtime <name>              Runtime preset or command name (default: kimi)",
        "  --command <path>              ACP command to spawn",
        "  --arg <value>                 Extra ACP command argument; repeatable",
        "  --cwd <path>                  Thread cwd",
        "  --message <text>              Message to send for turn timing",
        "  --skip-message                Skip send-message timings",
        "  --message-timeout-secs <n>    Message completion timeout (default: 120)",
        "  --auth | --no-auth            Override ACP auth expectation",
        "  --json                        Print JSON report",
    ]
    .join("\n")
}

fn print_report(report: &ProfileReport) {
    let runtime = match (&report.runtime.name, &report.runtime.version) {
        (Some(name), Some(version)) => format!("{name} {version}"),
        (Some(name), None) => name.clone(),
        _ => report.runtime.status.clone(),
    };
    println!("runtime: {runtime}");
    if let Some(conversation_id) = &report.conversation_id {
        println!("thread: {conversation_id}");
    }
    if let Some(turn_id) = &report.turn_id {
        println!("turn: {turn_id}");
    }
    println!();
    println!("{:<24} {:>12}  {:<8} details", "step", "ms", "status");
    println!("{:-<24} {:-<12}  {:-<8} {:-<1}", "", "", "", "");
    for step in &report.steps {
        print_step(step);
    }
    println!();
    println!(
        "successful measured total: {:.2} ms",
        report.total_duration_ms()
    );
}

fn print_step(step: &ProfileStep) {
    let status = match step.status {
        ProfileStepStatus::Ok => "ok",
        ProfileStepStatus::Failed => "failed",
        ProfileStepStatus::Skipped => "skipped",
    };
    let details = if let Some(error) = &step.error {
        error.clone()
    } else {
        step.details
            .iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect::<Vec<_>>()
            .join(" ")
    };
    println!(
        "{:<24} {:>12.2}  {:<8} {}",
        step.name, step.duration_ms, status, details
    );
}
