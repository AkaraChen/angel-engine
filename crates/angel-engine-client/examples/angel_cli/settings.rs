use std::error::Error;
use std::time::Duration;

use angel_engine_client::{ReasoningLevelSettingSnapshot, ThreadEvent};

use super::MultiRuntimeCli;

impl MultiRuntimeCli {
    pub(super) fn handle_setting_command(&mut self, line: &str) -> Result<bool, Box<dyn Error>> {
        let mut parts = line.splitn(2, char::is_whitespace);
        let command = parts
            .next()
            .ok_or("setting command is missing command name")?;
        let value = parts.next().map(str::trim);

        match command {
            "/model" => {
                let Some(value) = value else {
                    self.print_model_state()?;
                    return Ok(true);
                };
                let before = self.current_model_id()?;
                self.send_thread_event(ThreadEvent::set_model(value))?;
                self.pump_until_no_activity(Duration::from_millis(250))?;
                let after = self.current_model_id()?;
                if after != before {
                    println!("[state] model set to {}", after.as_deref().unwrap_or(value));
                } else {
                    println!("[warn] model unchanged");
                }
            }
            "/mode" => {
                let Some(value) = value else {
                    self.print_mode_state()?;
                    return Ok(true);
                };
                let before = self.current_mode_id()?;
                self.send_thread_event(ThreadEvent::set_mode(value))?;
                self.pump_until_no_activity(Duration::from_millis(250))?;
                let after = self.current_mode_id()?;
                if after != before {
                    println!("[state] mode set to {}", after.as_deref().unwrap_or(value));
                } else {
                    println!("[warn] mode unchanged");
                }
                if self.codex_mode_needs_model_warning(value)? {
                    println!(
                        "[warn] Codex collaborationMode requires a model in turn/start; set /model first if the next turn does not switch mode"
                    );
                }
            }
            "/effort" | "/reasoning" => {
                let Some(value) = value else {
                    self.print_effort_state()?;
                    return Ok(true);
                };
                let reasoning = self.current_conversation()?.settings.reasoning_level;
                let Some(effort) = reasoning.normalize_effort(value) else {
                    if reasoning.available_levels.is_empty() {
                        println!("[warn] reasoning effort is unavailable for this runtime");
                    } else {
                        println!(
                            "[warn] use one of: {}",
                            reasoning.available_levels.join(", ")
                        );
                    }
                    return Ok(true);
                };
                let before = self.current_effort_level()?;
                self.send_thread_event(ThreadEvent::set_reasoning_effort(effort))?;
                self.pump_until_no_activity(Duration::from_millis(250))?;
                let after = self.current_effort_level()?;
                if after != before {
                    println!(
                        "[state] reasoning effort set to {}",
                        after.as_deref().unwrap_or(value)
                    );
                } else {
                    println!("[warn] reasoning effort unchanged");
                }
            }
            _ => return Ok(false),
        }
        Ok(true)
    }

    fn current_model_id(&self) -> Result<Option<String>, Box<dyn Error>> {
        Ok(self
            .current_conversation()?
            .settings
            .model_list
            .current_model_id)
    }

    fn current_mode_id(&self) -> Result<Option<String>, Box<dyn Error>> {
        Ok(self
            .current_conversation()?
            .settings
            .available_modes
            .current_mode_id)
    }

    fn current_effort_level(&self) -> Result<Option<String>, Box<dyn Error>> {
        Ok(self
            .current_conversation()?
            .settings
            .reasoning_level
            .current_level)
    }

    fn print_model_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation = self.current_conversation()?;
        let model_list = conversation.settings.model_list;
        let current = model_list
            .current_model_id
            .as_deref()
            .unwrap_or("(default)");
        println!("[model] current: {current}");
        let values = model_list
            .available_models
            .iter()
            .map(|model| model.id.as_str())
            .collect::<Vec<_>>();
        print_values("[model]", &values);
        Ok(())
    }

    fn print_mode_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation = self.current_conversation()?;
        let modes = conversation.settings.available_modes;
        let current = modes.current_mode_id.as_deref().unwrap_or("(default)");
        println!("[mode] current: {current}");
        let values = modes
            .available_modes
            .iter()
            .map(|mode| mode.id.as_str())
            .collect::<Vec<_>>();
        if values.is_empty() && self.runtime.is_codex() {
            println!("[mode] available: plan, default");
        } else {
            print_values("[mode]", &values);
        }
        Ok(())
    }

    fn print_effort_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation = self.current_conversation()?;
        let reasoning = conversation.settings.reasoning_level;
        let current = reasoning.current_level.as_deref().unwrap_or("(default)");
        println!("[effort] current: {current}");
        if !reasoning.available_levels.is_empty() {
            let values = reasoning
                .available_levels
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>();
            print_values("[effort]", &values);
        } else if !reasoning.can_set {
            println!("[effort] unavailable for this runtime");
        }
        Ok(())
    }

    fn codex_mode_needs_model_warning(&self, value: &str) -> Result<bool, Box<dyn Error>> {
        Ok(self.runtime.is_codex()
            && matches!(value, "plan" | "default")
            && self.current_conversation()?.context.model.is_none())
    }
}

trait ReasoningOptionsExt {
    fn normalize_effort(&self, value: &str) -> Option<String>;
}

impl ReasoningOptionsExt for ReasoningLevelSettingSnapshot {
    fn normalize_effort(&self, value: &str) -> Option<String> {
        if !self.can_set {
            return None;
        }
        if self.available_levels.is_empty() {
            return Some(value.to_string());
        }
        self.available_levels
            .iter()
            .find(|effort| effort.eq_ignore_ascii_case(value))
            .cloned()
    }
}

fn print_values(prefix: &str, values: &[&str]) {
    if !values.is_empty() {
        println!("{prefix} available: {}", values.join(", "));
    }
}
