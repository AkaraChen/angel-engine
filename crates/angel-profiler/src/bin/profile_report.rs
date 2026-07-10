use std::env;
use std::error::Error;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use angel_engine_client::ClientOptions;
use angel_profiler::{ProfileAttempt, ProfileRequest, profile_spawned_client_attempt};

#[path = "profile_report/render.rs"]
mod render;

use render::{print_summary, render_html};

fn main() -> Result<(), Box<dyn Error>> {
    let Some(config) = ReportConfig::parse(env::args().skip(1))? else {
        println!("{}", usage());
        return Ok(());
    };
    let request = config.profile_request()?;
    let targets = default_targets();
    let mut runs = Vec::new();

    for target in targets {
        println!("profiling {}...", target.id);
        let attempt = profile_spawned_client_attempt(target.options, request.clone());
        if let Some(error) = &attempt.error {
            eprintln!("{} failed: {error}", target.id);
        }
        runs.push(ProfileRun {
            id: target.id,
            label: target.label,
            attempt,
        });
    }

    let output = config.output_path()?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&output, render_html(&runs))?;
    print_summary(&runs);
    println!("wrote {}", output.display());

    if config.open {
        open::that(&output)?;
    }

    Ok(())
}

#[derive(Debug)]
struct ReportConfig {
    output: Option<PathBuf>,
    message: Option<String>,
    skip_message: bool,
    message_timeout: Duration,
    open: bool,
}

impl ReportConfig {
    fn parse(args: impl IntoIterator<Item = String>) -> Result<Option<Self>, String> {
        let mut config = Self {
            output: None,
            message: Some("Reply with exactly: profiler-ok".to_string()),
            skip_message: false,
            message_timeout: Duration::from_secs(120),
            open: true,
        };
        let mut iter = args.into_iter();

        while let Some(arg) = iter.next() {
            match arg.as_str() {
                "-h" | "--help" => return Ok(None),
                "--output" => {
                    config.output = Some(PathBuf::from(next_value(&mut iter, "--output")?))
                }
                "--message" => config.message = Some(next_value(&mut iter, "--message")?),
                "--skip-message" => config.skip_message = true,
                "--message-timeout-secs" => {
                    let value = next_value(&mut iter, "--message-timeout-secs")?;
                    let secs = value
                        .parse::<u64>()
                        .map_err(|_| format!("invalid --message-timeout-secs value: {value}"))?;
                    config.message_timeout = Duration::from_secs(secs);
                }
                "--no-open" => config.open = false,
                value => return Err(format!("unknown option: {value}\n\n{}", usage())),
            }
        }

        Ok(Some(config))
    }

    fn profile_request(&self) -> Result<ProfileRequest, String> {
        let mut request = ProfileRequest::new().message_timeout(self.message_timeout);
        if self.skip_message {
            request = request.skip_message();
        } else if let Some(message) = &self.message {
            request = request.message(message.clone());
        }
        Ok(request)
    }

    fn output_path(&self) -> Result<PathBuf, Box<dyn Error>> {
        if let Some(output) = &self.output {
            return Ok(output.clone());
        }
        let seconds = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        Ok(PathBuf::from(format!(
            "target/angel-profiler/profile-{seconds}.html"
        )))
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
        "Usage: angel-profile-report [options]",
        "",
        "Runs kimi, opencode, and codex profiles, writes an HTML timing report,",
        "and opens it with the Rust open crate by default.",
        "",
        "Options:",
        "  --output <path>               HTML report path",
        "  --message <text>              Message to send for turn timing",
        "  --skip-message                Skip send-message timings",
        "  --message-timeout-secs <n>    Message completion timeout per runtime (default: 120)",
        "  --no-open                     Write the report without opening it",
    ]
    .join("\n")
}

#[derive(Debug)]
struct ProfileTarget {
    id: String,
    label: String,
    options: ClientOptions,
}

#[derive(Debug)]
struct ProfileRun {
    id: String,
    label: String,
    attempt: ProfileAttempt,
}

fn default_targets() -> Vec<ProfileTarget> {
    vec![
        ProfileTarget {
            id: "kimi".to_string(),
            label: "Kimi ACP".to_string(),
            options: ClientOptions::builder()
                .acp("kimi")
                .arg("acp")
                .need_auth(true)
                .auto_authenticate(true)
                .client_name("angel-profiler")
                .client_title("Angel Profiler")
                .build(),
        },
        ProfileTarget {
            id: "opencode".to_string(),
            label: "OpenCode ACP".to_string(),
            options: ClientOptions::builder()
                .acp("opencode")
                .arg("acp")
                .need_auth(false)
                .auto_authenticate(false)
                .client_name("angel-profiler")
                .client_title("Angel Profiler")
                .build(),
        },
        ProfileTarget {
            id: "codex".to_string(),
            label: "Codex App Server".to_string(),
            options: ClientOptions::builder()
                .codex_app_server("codex")
                .arg("app-server")
                .client_name("angel-profiler")
                .client_title("Angel Profiler")
                .build(),
        },
    ]
}
