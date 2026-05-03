use std::ffi::OsStr;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

pub struct RuntimeProcess {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<AppLine>,
}

impl RuntimeProcess {
    pub fn spawn<I, S>(command: impl AsRef<OsStr>, args: I) -> io::Result<Self>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let stdin = child.stdin.take().ok_or_else(|| {
            io::Error::new(io::ErrorKind::BrokenPipe, "runtime process missing stdin")
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            io::Error::new(io::ErrorKind::BrokenPipe, "runtime process missing stdout")
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            io::Error::new(io::ErrorKind::BrokenPipe, "runtime process missing stderr")
        })?;

        let (tx, rx) = mpsc::channel();
        spawn_line_reader(stdout, tx.clone(), AppLine::Stdout);
        spawn_line_reader(stderr, tx, AppLine::Stderr);

        Ok(Self {
            child,
            stdin,
            lines: rx,
        })
    }

    pub fn recv(&self) -> io::Result<AppLine> {
        self.lines
            .recv()
            .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "runtime process closed"))
    }

    pub fn recv_timeout(&self, timeout: Duration) -> io::Result<Option<AppLine>> {
        match self.lines.recv_timeout(timeout) {
            Ok(line) => Ok(Some(line)),
            Err(mpsc::RecvTimeoutError::Timeout) => Ok(None),
            Err(mpsc::RecvTimeoutError::Disconnected) => Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "runtime process closed",
            )),
        }
    }

    pub fn write_line(&mut self, line: &str) -> io::Result<()> {
        writeln!(self.stdin, "{line}")?;
        self.stdin.flush()
    }
}

impl Drop for RuntimeProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AppLine {
    Stdout(String),
    Stderr(String),
}

fn spawn_line_reader<R, F>(reader: R, tx: mpsc::Sender<AppLine>, wrap: F)
where
    R: io::Read + Send + 'static,
    F: Fn(String) -> AppLine + Send + 'static + Copy,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            if tx.send(wrap(line)).is_err() {
                break;
            }
        }
    });
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TaggedLog {
    pub kind: TaggedLogKind,
    pub message: String,
}

impl TaggedLog {
    pub fn new(kind: TaggedLogKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaggedLogKind {
    Output,
    Send,
    Receive,
    State,
    Warning,
    Error,
    ProcessStdout,
    ProcessStderr,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum InlineOutput {
    #[default]
    None,
    Assistant,
    Reasoning,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InlineStreamKind {
    Assistant,
    Reasoning,
}

#[derive(Clone, Debug, Default)]
pub struct InlinePrinter {
    inline_output: InlineOutput,
}

impl InlinePrinter {
    pub fn print_log(&mut self, log: &TaggedLog) -> io::Result<()> {
        if log.kind != TaggedLogKind::Output {
            self.finish_inline_output()?;
            return print_log_line(log);
        }

        if let Some(reasoning) = log.message.strip_prefix("[reasoning] ") {
            return self.print_inline_text(InlineStreamKind::Reasoning, reasoning);
        }

        self.print_inline_text(InlineStreamKind::Assistant, &log.message)
    }

    pub fn print_inline_text(&mut self, kind: InlineStreamKind, text: &str) -> io::Result<()> {
        match kind {
            InlineStreamKind::Assistant => self.print_assistant_text(text),
            InlineStreamKind::Reasoning => self.print_reasoning_text(text),
        }
    }

    fn print_assistant_text(&mut self, text: &str) -> io::Result<()> {
        if self.inline_output == InlineOutput::Reasoning {
            self.finish_inline_output()?;
        }
        self.inline_output = InlineOutput::Assistant;
        print!("{text}");
        io::stdout().flush()
    }

    fn print_reasoning_text(&mut self, text: &str) -> io::Result<()> {
        if self.inline_output != InlineOutput::Reasoning {
            self.finish_inline_output()?;
            print!("[reasoning] ");
            self.inline_output = InlineOutput::Reasoning;
        }
        print!("{text}");
        io::stdout().flush()
    }

    pub fn print_process_line(&mut self, label: &str, line: &str) -> io::Result<()> {
        self.finish_inline_output()?;
        println!("[{label}] {line}");
        Ok(())
    }

    pub fn before_tagged_output(&mut self) -> io::Result<()> {
        self.finish_inline_output()
    }

    pub fn finish_inline_output(&mut self) -> io::Result<()> {
        if self.inline_output != InlineOutput::None {
            println!();
            self.inline_output = InlineOutput::None;
        }
        Ok(())
    }
}

pub fn print_log_line(log: &TaggedLog) -> io::Result<()> {
    match log.kind {
        TaggedLogKind::Output => Ok(()),
        TaggedLogKind::Send => {
            println!("[send] {}", log.message);
            Ok(())
        }
        TaggedLogKind::Receive => {
            println!("[recv] {}", log.message);
            Ok(())
        }
        TaggedLogKind::State => {
            println!("[state] {}", log.message);
            Ok(())
        }
        TaggedLogKind::Warning => {
            println!("[warn] {}", log.message);
            Ok(())
        }
        TaggedLogKind::Error => {
            println!("[error] {}", log.message);
            Ok(())
        }
        TaggedLogKind::ProcessStdout => {
            println!("[stdout] {}", log.message);
            Ok(())
        }
        TaggedLogKind::ProcessStderr => {
            println!("[stderr] {}", log.message);
            Ok(())
        }
    }
}

pub fn read_prompt_line(prompt: &str) -> io::Result<Option<String>> {
    print!("{prompt}");
    io::stdout().flush()?;
    let mut input = String::new();
    if io::stdin().read_line(&mut input)? == 0 {
        return Ok(None);
    }
    Ok(Some(input.trim().to_string()))
}

pub fn read_stdin_line() -> io::Result<String> {
    let mut input = String::new();
    if io::stdin().read_line(&mut input)? == 0 {
        input.clear();
    }
    Ok(input)
}

pub fn is_quit_command(line: &str) -> bool {
    matches!(line, ":q" | ":quit" | "exit")
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CliCommandInfo {
    pub name: String,
    pub description: String,
    pub input_hint: Option<String>,
}

pub fn print_command_summary(commands: &[CliCommandInfo]) {
    if commands.is_empty() {
        return;
    }
    let names = commands
        .iter()
        .take(8)
        .map(|command| format!("/{}", command.name))
        .collect::<Vec<_>>()
        .join(", ");
    let suffix = if commands.len() > 8 { ", ..." } else { "" };
    println!(
        "[commands] {} available: {names}{suffix}; type /commands to list",
        commands.len()
    );
}

pub fn print_available_commands(commands: &[CliCommandInfo]) {
    if commands.is_empty() {
        println!("[commands] no slash commands advertised");
        return;
    }
    for command in commands {
        let input = command
            .input_hint
            .as_ref()
            .map(|hint| format!(" <{}>", compact_text(hint, 40)))
            .unwrap_or_default();
        let description = compact_text(&command.description, 160);
        println!("[commands] /{}{} - {}", command.name, input, description);
    }
}

pub fn compact_text(text: &str, max_chars: usize) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= max_chars {
        return compact;
    }
    let mut truncated = compact
        .chars()
        .take(max_chars.saturating_sub(3))
        .collect::<String>();
    truncated.push_str("...");
    truncated
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ApprovalChoice {
    Allow,
    AllowForSession,
    Deny,
    Cancel,
}

pub fn prompt_approval(
    title: Option<&str>,
    body: Option<&str>,
    choices: &[String],
) -> io::Result<ApprovalChoice> {
    println!("[approval] {}", title.unwrap_or("approval requested"));
    if let Some(body) = body
        && !body.is_empty()
    {
        println!("[approval] {body}");
    }
    if !choices.is_empty() {
        println!("[approval] options: {}", choices.join(", "));
    }
    print!("Allow? [y]es/[s]ession/[n]o/[c]ancel: ");
    io::stdout().flush()?;
    let input = read_stdin_line()?;
    Ok(match input.trim().to_ascii_lowercase().as_str() {
        "y" | "yes" | "allow" => ApprovalChoice::Allow,
        "s" | "session" | "always" => ApprovalChoice::AllowForSession,
        "c" | "cancel" => ApprovalChoice::Cancel,
        _ => ApprovalChoice::Deny,
    })
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CliQuestion {
    pub id: String,
    pub header: String,
    pub question: String,
    pub options: Vec<CliQuestionOption>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CliQuestionOption {
    pub label: String,
    pub description: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CliAnswer {
    pub id: String,
    pub value: String,
}

pub fn prompt_answers(
    title: Option<&str>,
    body: Option<&str>,
    questions: &[CliQuestion],
) -> io::Result<Option<Vec<CliAnswer>>> {
    println!("[input] {}", title.unwrap_or("input requested"));
    if questions.is_empty() {
        if let Some(body) = body
            && !body.is_empty()
        {
            println!("[input] {body}");
        }
        print!("Type your answer, or :cancel to cancel: ");
        io::stdout().flush()?;
        let input = read_stdin_line()?;
        if input.trim() == ":cancel" {
            return Ok(None);
        }
        return Ok(Some(vec![CliAnswer {
            id: "answer".to_string(),
            value: input.trim().to_string(),
        }]));
    }

    let mut answers = Vec::new();
    for question in questions {
        print_question(question);
        if question.options.is_empty() {
            print!("Type your answer, or :cancel to cancel: ");
        } else {
            print!(
                "Choose 1-{} (or exact option text); use commas for multiple; :cancel to cancel: ",
                question.options.len()
            );
        }
        io::stdout().flush()?;
        let input = read_stdin_line()?;
        if input.trim() == ":cancel" {
            return Ok(None);
        }
        let values = answer_values(question, input.trim());
        if values.is_empty() {
            answers.push(CliAnswer {
                id: question.id.clone(),
                value: String::new(),
            });
        } else {
            answers.extend(values.into_iter().map(|value| CliAnswer {
                id: question.id.clone(),
                value,
            }));
        }
    }
    Ok(Some(answers))
}

pub fn print_question(question: &CliQuestion) {
    if !question.header.is_empty() {
        println!("[input] {}", question.header);
    }
    println!("[input] {}", question.question);
    for (index, option) in question.options.iter().enumerate() {
        if option.description.is_empty() {
            println!("[input] {}. {}", index + 1, option.label);
        } else {
            println!(
                "[input] {}. {} - {}",
                index + 1,
                option.label,
                option.description
            );
        }
    }
}

pub fn answer_values(question: &CliQuestion, input: &str) -> Vec<String> {
    if question.options.is_empty() {
        return if input.is_empty() {
            Vec::new()
        } else {
            vec![input.to_string()]
        };
    }

    input
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            value
                .parse::<usize>()
                .ok()
                .and_then(|index| index.checked_sub(1))
                .and_then(|index| question.options.get(index))
                .map(|option| option.label.clone())
                .unwrap_or_else(|| value.to_string())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn answer_values_maps_numbered_choices_and_free_text() {
        let question = CliQuestion {
            id: "path".to_string(),
            header: "Plan path".to_string(),
            question: "Where should the plan be saved?".to_string(),
            options: vec![
                CliQuestionOption {
                    label: "plans/plan.md".to_string(),
                    description: "Use the plans folder".to_string(),
                },
                CliQuestionOption {
                    label: "PLAN.md".to_string(),
                    description: "Use the repository root".to_string(),
                },
            ],
        };

        assert_eq!(
            answer_values(&question, "1, PLAN.md"),
            vec!["plans/plan.md".to_string(), "PLAN.md".to_string()]
        );
    }

    #[test]
    fn compact_text_normalizes_whitespace_and_truncates() {
        assert_eq!(compact_text("a\n  b\tc", 20), "a b c");
        assert_eq!(compact_text("abcdefghijkl", 8), "abcde...");
    }
}
