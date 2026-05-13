use std::env;
use std::error::Error;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use angel_engine_client::ClientOptions;
use angel_profiler::{
    ProfileAttempt, ProfileReport, ProfileRequest, ProfileStep, ProfileStepStatus,
    profile_spawned_client_attempt,
};

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

fn render_html(runs: &[ProfileRun]) -> String {
    let max_duration = runs
        .iter()
        .map(|run| run_timeline_duration_ms(&run.attempt.report))
        .fold(0.0, f64::max)
        .max(1.0);

    let mut html = String::new();
    html.push_str("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">");
    html.push_str("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
    html.push_str("<title>Angel Profiler Timeline</title>");
    html.push_str("<style>");
    html.push_str(STYLE);
    html.push_str("</style></head><body>");
    html.push_str("<main>");
    html.push_str("<header><div><h1>Angel Profiler Timeline</h1>");
    html.push_str(
        "<p>Durations are measured from the public angel client API. Each row is one runtime.</p>",
    );
    html.push_str("</div><div class=\"legend\"><span><i class=\"ok\"></i>ok</span><span><i class=\"failed\"></i>failed</span><span><i class=\"skipped\"></i>skipped</span></div></header>");
    html.push_str(&summary_table(runs));
    html.push_str("<section class=\"timeline\" aria-label=\"runtime timing chart\">");
    html.push_str(&axis(max_duration));
    for run in runs {
        html.push_str(&run_timeline(run, max_duration));
    }
    html.push_str("</section>");
    html.push_str("<section class=\"details\"><h2>Step Details</h2>");
    for run in runs {
        html.push_str(&run_details(run));
    }
    html.push_str("</section></main></body></html>");
    html
}

fn print_summary(runs: &[ProfileRun]) {
    println!();
    println!("{:<10} {:<7} {:>10}  error", "runtime", "status", "total");
    println!("{:-<10} {:-<7} {:->10}  {:-<1}", "", "", "", "");
    for run in runs {
        println!(
            "{:<10} {:<7} {:>10}  {}",
            run.id,
            if run.attempt.is_ok() { "ok" } else { "failed" },
            format_duration(run.attempt.report.total_duration_ms()),
            run.attempt.error.as_deref().unwrap_or("")
        );
    }
    println!();
}

fn summary_table(runs: &[ProfileRun]) -> String {
    let mut html = String::from(
        "<section class=\"summary\"><table><thead><tr><th>Runtime</th><th>Status</th><th>Total</th><th>Thread</th><th>Turn</th><th>Error</th></tr></thead><tbody>",
    );
    for run in runs {
        let report = &run.attempt.report;
        html.push_str("<tr>");
        html.push_str(&format!(
            "<td><strong>{}</strong><br><span class=\"runtime-id\">{}</span></td>",
            escape_html(&run.label),
            escape_html(&run.id)
        ));
        html.push_str(&format!(
            "<td><span class=\"pill {}\">{}</span></td>",
            if run.attempt.is_ok() { "ok" } else { "failed" },
            if run.attempt.is_ok() { "ok" } else { "failed" }
        ));
        html.push_str(&format!(
            "<td>{}</td>",
            format_duration(report.total_duration_ms())
        ));
        html.push_str(&format!(
            "<td>{}</td>",
            escape_html(report.conversation_id.as_deref().unwrap_or(""))
        ));
        html.push_str(&format!(
            "<td>{}</td>",
            escape_html(report.turn_id.as_deref().unwrap_or(""))
        ));
        html.push_str(&format!(
            "<td>{}</td>",
            escape_html(run.attempt.error.as_deref().unwrap_or(""))
        ));
        html.push_str("</tr>");
    }
    html.push_str("</tbody></table></section>");
    html
}

fn axis(max_duration: f64) -> String {
    let marks = 5;
    let mut html = String::from("<div class=\"axis\"><div></div><div class=\"axis-track\">");
    for index in 0..=marks {
        let left = index as f64 / marks as f64 * 100.0;
        let value = max_duration * index as f64 / marks as f64;
        html.push_str(&format!(
            "<span class=\"tick\" style=\"left:{left:.4}%\"><i></i><b>{}</b></span>",
            format_duration(value)
        ));
    }
    html.push_str("</div></div>");
    html
}

fn run_timeline(run: &ProfileRun, max_duration: f64) -> String {
    let mut cursor = 0.0;
    let mut html = String::new();
    html.push_str(&format!(
        "<article class=\"runtime-row\" data-runtime=\"{}\">",
        escape_html(&run.id)
    ));
    html.push_str("<div class=\"runtime-label\">");
    html.push_str(&format!("<h2>{}</h2>", escape_html(&run.label)));
    html.push_str(&format!(
        "<p>{}</p>",
        escape_html(runtime_caption(&run.attempt.report).as_str())
    ));
    html.push_str("</div><div class=\"bars\">");
    for step in timeline_steps(&run.attempt.report) {
        let duration = step.duration_ms.max(0.0);
        let left = cursor / max_duration * 100.0;
        let width = (duration / max_duration * 100.0).max(0.18);
        let status = status_class(step.status);
        let label = escape_html(&step.name);
        let title = escape_html(&format!("{}: {}", step.name, format_duration(duration)));
        html.push_str(&format!(
            "<div class=\"bar {status}\" style=\"left:{left:.4}%;width:{width:.4}%\" title=\"{title}\"><span>{label}</span></div>"
        ));
        cursor += duration;
    }
    if let Some(error) = &run.attempt.error {
        html.push_str(&format!(
            "<div class=\"row-error\">{}</div>",
            escape_html(error)
        ));
    }
    html.push_str("</div></article>");
    html
}

fn run_details(run: &ProfileRun) -> String {
    let mut html = String::new();
    html.push_str("<article class=\"detail-card\">");
    html.push_str(&format!("<h3>{}</h3>", escape_html(&run.label)));
    html.push_str("<table><thead><tr><th>Step</th><th>Status</th><th>Duration</th><th>Details</th></tr></thead><tbody>");
    for step in &run.attempt.report.steps {
        html.push_str("<tr>");
        html.push_str(&format!("<td>{}</td>", escape_html(&step.name)));
        html.push_str(&format!(
            "<td><span class=\"pill {}\">{}</span></td>",
            status_class(step.status),
            status_label(step.status)
        ));
        html.push_str(&format!("<td>{}</td>", format_duration(step.duration_ms)));
        html.push_str(&format!("<td>{}</td>", escape_html(&step_details(step))));
        html.push_str("</tr>");
    }
    html.push_str("</tbody></table></article>");
    html
}

fn timeline_steps(report: &ProfileReport) -> impl Iterator<Item = &ProfileStep> {
    report
        .steps
        .iter()
        .filter(|step| step.name != "thread_snapshot" && step.name != "send_message_total")
}

fn run_timeline_duration_ms(report: &ProfileReport) -> f64 {
    timeline_steps(report).map(|step| step.duration_ms).sum()
}

fn runtime_caption(report: &ProfileReport) -> String {
    match (&report.runtime.name, &report.runtime.version) {
        (Some(name), Some(version)) => format!("{name} {version}"),
        (Some(name), None) => name.clone(),
        _ => report.runtime.status.clone(),
    }
}

fn status_class(status: ProfileStepStatus) -> &'static str {
    match status {
        ProfileStepStatus::Ok => "ok",
        ProfileStepStatus::Failed => "failed",
        ProfileStepStatus::Skipped => "skipped",
    }
}

fn status_label(status: ProfileStepStatus) -> &'static str {
    match status {
        ProfileStepStatus::Ok => "ok",
        ProfileStepStatus::Failed => "failed",
        ProfileStepStatus::Skipped => "skipped",
    }
}

fn step_details(step: &ProfileStep) -> String {
    if let Some(error) = &step.error {
        return error.clone();
    }
    step.details
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_duration(ms: f64) -> String {
    if ms >= 1000.0 {
        format!("{:.2}s", ms / 1000.0)
    } else {
        format!("{ms:.2}ms")
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

const STYLE: &str = r#"
:root {
  color-scheme: light;
  --bg: #f6f7f9;
  --panel: #ffffff;
  --ink: #16181d;
  --muted: #667085;
  --line: #d9dee7;
  --ok: #1f8a70;
  --ok-soft: #d9f1e8;
  --failed: #c2410c;
  --failed-soft: #ffe2d5;
  --skipped: #6b7280;
  --skipped-soft: #ebeef2;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
}
main {
  width: min(1440px, calc(100vw - 48px));
  margin: 0 auto;
  padding: 32px 0 48px;
}
header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 24px;
}
h1, h2, h3, p { margin: 0; }
h1 { font-size: 28px; line-height: 1.15; letter-spacing: 0; }
header p {
  color: var(--muted);
  margin-top: 8px;
}
.legend {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--muted);
  white-space: nowrap;
}
.legend span {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.legend i {
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
}
.ok { background: var(--ok); }
.failed { background: var(--failed); }
.skipped { background: var(--skipped); }
section {
  margin-top: 18px;
}
.summary, .timeline, .detail-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.summary {
  overflow: auto;
}
.runtime-id {
  display: inline-block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th {
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  text-transform: uppercase;
}
tr:last-child td { border-bottom: 0; }
.pill {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
}
.pill.ok { color: var(--ok); background: var(--ok-soft); }
.pill.failed { color: var(--failed); background: var(--failed-soft); }
.pill.skipped { color: var(--skipped); background: var(--skipped-soft); }
.timeline {
  padding: 18px;
}
.axis,
.runtime-row {
  display: grid;
  grid-template-columns: 210px 1fr;
  gap: 20px;
}
.axis {
  height: 32px;
  color: var(--muted);
  font-size: 12px;
}
.axis-track {
  position: relative;
  border-bottom: 1px solid var(--line);
}
.tick {
  position: absolute;
  bottom: -24px;
  transform: translateX(-50%);
}
.tick:first-child { transform: translateX(0); }
.tick:last-child { transform: translateX(-100%); }
.tick i {
  position: absolute;
  left: 50%;
  bottom: 18px;
  width: 1px;
  height: 8px;
  background: var(--line);
}
.tick b { font-weight: 500; }
.runtime-row {
  min-height: 86px;
  border-top: 1px solid var(--line);
  padding: 18px 0 10px;
}
.runtime-row:first-of-type {
  border-top: 0;
}
.runtime-label h2 {
  font-size: 16px;
  line-height: 1.25;
  letter-spacing: 0;
}
.runtime-label p {
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
}
.bars {
  position: relative;
  min-height: 52px;
  border-left: 1px solid var(--line);
  background:
    linear-gradient(to right, rgba(217,222,231,.75) 1px, transparent 1px) 0 0 / 20% 100%;
}
.bar {
  position: absolute;
  top: 12px;
  height: 28px;
  min-width: 3px;
  border-radius: 5px;
  overflow: hidden;
  color: #fff;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.08);
}
.bar span {
  display: block;
  padding: 6px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 16px;
}
.bar.ok { background: var(--ok); }
.bar.failed { background: var(--failed); }
.bar.skipped { background: var(--skipped); }
.row-error {
  position: absolute;
  top: 44px;
  left: 0;
  right: 0;
  color: var(--failed);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.details h2 {
  font-size: 20px;
  margin: 0 0 12px;
}
.detail-card {
  margin-top: 12px;
  overflow: auto;
}
.detail-card h3 {
  padding: 14px 12px 4px;
  font-size: 16px;
  letter-spacing: 0;
}
@media (max-width: 760px) {
  main { width: min(100vw - 24px, 1440px); padding-top: 20px; }
  header { display: block; }
  .legend { margin-top: 12px; flex-wrap: wrap; }
  .axis, .runtime-row { grid-template-columns: 1fr; gap: 8px; }
  .axis > div:first-child { display: none; }
  .runtime-row { min-height: 120px; }
}
"#;
