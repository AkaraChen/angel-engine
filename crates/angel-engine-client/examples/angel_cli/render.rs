use std::error::Error;

use angel_engine_client::{
    AvailableCommandSnapshot, ClientEvent, ClientLog, ClientStreamDelta, ClientUpdate,
};
use test_cli::{
    CliCommandInfo, InlineStreamKind, TaggedLog, TaggedLogKind, print_available_commands,
    print_command_summary,
};

use super::MultiRuntimeCli;

impl MultiRuntimeCli {
    pub(super) fn handle_update(&mut self, update: ClientUpdate) -> Result<(), Box<dyn Error>> {
        for delta in &update.stream_deltas {
            self.print_stream_delta(delta)?;
        }
        for log in &update.logs {
            if log.kind == angel_engine_client::ClientLogKind::Output
                && !update.stream_deltas.is_empty()
            {
                continue;
            }
            self.printer.print_log(&client_log(log))?;
        }
        for event in &update.events {
            if event_prints(event) {
                self.printer.before_tagged_output()?;
            }
            print_event(event);
        }
        Ok(())
    }

    fn print_stream_delta(&mut self, delta: &ClientStreamDelta) -> Result<(), Box<dyn Error>> {
        match delta {
            ClientStreamDelta::AssistantDelta { content, .. } => self
                .printer
                .print_inline_text(InlineStreamKind::Assistant, &content.text)?,
            ClientStreamDelta::ActionOutputDelta { content, .. } => self
                .printer
                .print_inline_text(InlineStreamKind::Assistant, &content.text)?,
            ClientStreamDelta::ReasoningDelta { content, .. }
            | ClientStreamDelta::PlanDelta { content, .. } => self
                .printer
                .print_inline_text(InlineStreamKind::Reasoning, &content.text)?,
        }
        Ok(())
    }

    pub(super) fn print_banner(&self) -> Result<(), Box<dyn Error>> {
        println!("{}", self.runtime.banner());
        if self.runtime.supports_shell() {
            println!("Type a message, /shell <command>, /model, /mode, /effort, or :quit.");
        } else {
            println!("Type a message, /model, /mode, /effort, or :quit.");
        }
        self.print_available_commands()?;
        Ok(())
    }

    fn print_available_commands(&self) -> Result<(), Box<dyn Error>> {
        let commands = self.current_commands()?;
        print_command_summary(&commands);
        Ok(())
    }

    pub(super) fn print_available_command_list(&self) -> Result<(), Box<dyn Error>> {
        let commands = self.current_commands()?;
        print_available_commands(&commands);
        Ok(())
    }

    fn current_commands(&self) -> Result<Vec<CliCommandInfo>, Box<dyn Error>> {
        Ok(cli_commands(
            &self.current_conversation()?.available_commands,
        ))
    }
}

fn client_log(log: &ClientLog) -> TaggedLog {
    TaggedLog::new(
        match log.kind {
            angel_engine_client::ClientLogKind::Send => TaggedLogKind::Send,
            angel_engine_client::ClientLogKind::Receive => TaggedLogKind::Receive,
            angel_engine_client::ClientLogKind::State => TaggedLogKind::State,
            angel_engine_client::ClientLogKind::Output => TaggedLogKind::Output,
            angel_engine_client::ClientLogKind::Warning => TaggedLogKind::Warning,
            angel_engine_client::ClientLogKind::Error => TaggedLogKind::Error,
            angel_engine_client::ClientLogKind::ProcessStdout => TaggedLogKind::ProcessStdout,
            angel_engine_client::ClientLogKind::ProcessStderr => TaggedLogKind::ProcessStderr,
        },
        log.message.clone(),
    )
}

fn cli_commands(commands: &[AvailableCommandSnapshot]) -> Vec<CliCommandInfo> {
    commands
        .iter()
        .map(|command| CliCommandInfo {
            name: command.name.clone(),
            description: command.description.clone(),
            input_hint: command.input_hint.clone(),
        })
        .collect()
}

fn print_event(event: &ClientEvent) {
    match event {
        ClientEvent::RuntimeAuthRequired { methods } => {
            println!(
                "[auth] runtime requested auth: {}",
                methods
                    .iter()
                    .map(|method| method.label.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            );
        }
        ClientEvent::RuntimeReady { name, version } => {
            if let Some(version) = version {
                println!("[runtime] {name} {version} ready");
            } else {
                println!("[runtime] {name} ready");
            }
        }
        ClientEvent::ConversationReady { conversation } => {
            println!(
                "[thread] {} ready ({})",
                conversation.id,
                conversation.remote_id.as_deref().unwrap_or("local")
            );
        }
        ClientEvent::AvailableCommandsUpdated {
            conversation_id,
            count,
        } => {
            println!("[thread] {conversation_id} commands updated: {count}");
        }
        ClientEvent::SessionUsageUpdated {
            conversation_id,
            usage,
        } => {
            println!("[usage] {conversation_id}: {}/{}", usage.used, usage.size);
        }
        ClientEvent::ActionObserved { action, .. } => {
            println!(
                "[tool call] {}",
                action.title.as_deref().unwrap_or(action.kind.as_str())
            );
        }
        _ => {}
    }
}

fn event_prints(event: &ClientEvent) -> bool {
    matches!(
        event,
        ClientEvent::RuntimeAuthRequired { .. }
            | ClientEvent::RuntimeReady { .. }
            | ClientEvent::ConversationReady { .. }
            | ClientEvent::AvailableCommandsUpdated { .. }
            | ClientEvent::SessionUsageUpdated { .. }
            | ClientEvent::ActionObserved { .. }
    )
}
