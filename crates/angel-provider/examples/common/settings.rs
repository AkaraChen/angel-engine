use std::error::Error;

use angel_engine::{
    AgentMode, ApprovalPolicy, AvailableCommand, ContextPatch, ContextScope, ContextUpdate,
    ConversationId, ConversationState, PermissionProfile, ProtocolFlavor, ReasoningProfile,
    SandboxProfile, SessionConfigOption,
};
use angel_provider::ProtocolAdapter;
use test_cli::{CliCommandInfo, print_available_commands, print_command_summary};

use super::ProtocolShell;

impl<A> ProtocolShell<A>
where
    A: ProtocolAdapter,
{
    pub(super) fn handle_setting_command(&mut self, line: &str) -> Result<bool, Box<dyn Error>> {
        let mut parts = line.splitn(2, char::is_whitespace);
        let command = parts.next().unwrap_or_default();
        let value = parts.next().unwrap_or_default().trim();
        match command {
            "/model" => {
                if value.is_empty() {
                    self.print_model_state()?;
                } else if self.update_context(ContextPatch::one(ContextUpdate::Model {
                    scope: ContextScope::TurnAndFuture,
                    model: Some(value.to_string()),
                }))? {
                    println!("[state] model set to {value}");
                }
                Ok(true)
            }
            "/effort" | "/reasoning" => {
                if value.is_empty() {
                    self.print_effort_state()?;
                } else if self.config.protocol == ProtocolFlavor::CodexAppServer
                    && !is_codex_reasoning_effort(value)
                {
                    println!("[warn] use one of: none, minimal, low, medium, high, xhigh");
                } else {
                    let effort = if self.config.protocol == ProtocolFlavor::CodexAppServer {
                        value.to_ascii_lowercase()
                    } else {
                        value.to_string()
                    };
                    let mut reasoning = self.current_reasoning_profile()?;
                    reasoning.effort = Some(effort);
                    if self.update_context(ContextPatch::one(ContextUpdate::Reasoning {
                        scope: ContextScope::TurnAndFuture,
                        reasoning: Some(reasoning),
                    }))? {
                        println!("[state] reasoning effort set to {value}");
                    }
                }
                Ok(true)
            }
            "/mode" => {
                if value.is_empty() {
                    self.print_mode_state()?;
                } else if self.update_context(ContextPatch::one(ContextUpdate::Mode {
                    scope: ContextScope::TurnAndFuture,
                    mode: Some(AgentMode {
                        id: value.to_string(),
                    }),
                }))? {
                    println!("[state] mode set to {value}");
                    if self.codex_mode_needs_model_warning(value) {
                        println!(
                            "[warn] Codex collaborationMode requires a model in turn/start; set /model first if the next turn does not switch mode"
                        );
                    }
                }
                Ok(true)
            }
            "/permission" => {
                if value.is_empty() {
                    self.print_permission_state()?;
                } else if self.update_context(ContextPatch::one(ContextUpdate::Permissions {
                    scope: ContextScope::TurnAndFuture,
                    permissions: PermissionProfile {
                        name: value.to_string(),
                    },
                }))? {
                    println!("[state] permission profile set to {value}");
                }
                Ok(true)
            }
            "/approval" => {
                if value.is_empty() {
                    self.print_permission_state()?;
                } else if let Some(policy) = parse_approval_policy(value) {
                    if self.update_context(ContextPatch::one(ContextUpdate::ApprovalPolicy {
                        scope: ContextScope::TurnAndFuture,
                        policy,
                    }))? {
                        println!("[state] approval policy set to {value}");
                    }
                } else {
                    println!("[warn] use one of: never, on-request, on-failure, untrusted");
                }
                Ok(true)
            }
            "/sandbox" => {
                if value.is_empty() {
                    self.print_permission_state()?;
                } else if let Some(sandbox) = parse_sandbox_profile(value) {
                    if self.update_context(ContextPatch::one(ContextUpdate::Sandbox {
                        scope: ContextScope::TurnAndFuture,
                        sandbox,
                    }))? {
                        println!("[state] sandbox set to {value}");
                    }
                } else {
                    println!("[warn] use one of: read-only, workspace-write, danger-full-access");
                }
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    pub(super) fn update_context(&mut self, patch: ContextPatch) -> Result<bool, Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let before = self.context_snapshot(&conversation_id);
        let plan = self
            .engine
            .plan_command(angel_engine::EngineCommand::UpdateContext {
                conversation_id: conversation_id.clone(),
                patch,
            })?;
        let request_id = plan.request_id.clone();
        let has_effects = !plan.effects.is_empty();
        self.send_plan(plan)?;
        if let Some(request_id) = request_id {
            while self.engine.pending.requests.contains_key(&request_id) {
                self.process_next_line(None)?;
            }
        } else if !has_effects {
            if self.config.protocol == ProtocolFlavor::CodexAppServer {
                println!("[state] local setting will be sent with the next turn");
            } else {
                println!("[warn] no ACP config or mode endpoint was advertised for that setting");
            }
        }
        Ok(before != self.context_snapshot(&conversation_id))
    }

    pub(super) fn selected_conversation(&self) -> Result<ConversationId, Box<dyn Error>> {
        self.engine
            .selected
            .clone()
            .ok_or_else(|| "no selected conversation".into())
    }

    pub(super) fn selected_active_turn_count(&self) -> usize {
        self.engine
            .selected
            .as_ref()
            .and_then(|id| self.engine.conversations.get(id))
            .map(|conversation| conversation.active_turn_count())
            .unwrap_or(0)
    }

    fn context_snapshot(&self, conversation_id: &ConversationId) -> String {
        self.engine
            .conversations
            .get(conversation_id)
            .map(|conversation| {
                format!(
                    "{:?}{:?}{:?}{:?}",
                    conversation.context,
                    conversation.config_options,
                    conversation.mode_state,
                    conversation.model_state
                )
            })
            .unwrap_or_default()
    }

    fn current_reasoning_profile(&self) -> Result<ReasoningProfile, Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let conversation = self
            .engine
            .conversations
            .get(&conversation_id)
            .ok_or("selected conversation missing")?;
        Ok(conversation
            .context
            .reasoning
            .effective()
            .and_then(Clone::clone)
            .unwrap_or(ReasoningProfile { effort: None }))
    }

    pub(super) fn selected_available_commands(&self) -> &[AvailableCommand] {
        self.engine
            .selected
            .as_ref()
            .and_then(|id| self.engine.conversations.get(id))
            .map(|conversation| conversation.available_commands.as_slice())
            .unwrap_or(&[])
    }

    fn print_model_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let conversation = self
            .engine
            .conversations
            .get(&conversation_id)
            .ok_or("selected conversation missing")?;
        let current = self
            .current_model()
            .unwrap_or_else(|| "(default)".to_string());
        println!("[model] current: {current}");
        if let Some(option) = config_option(conversation, "model", &["model"]) {
            print_config_values("[model]", option);
        } else if let Some(models) = &conversation.model_state {
            let values = models
                .available_models
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>();
            print_values("[model]", &values);
        }
        Ok(())
    }

    fn print_effort_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let conversation = self
            .engine
            .conversations
            .get(&conversation_id)
            .ok_or("selected conversation missing")?;
        let current = conversation
            .context
            .reasoning
            .effective()
            .and_then(|reasoning| reasoning.as_ref())
            .and_then(|reasoning| reasoning.effort.as_deref())
            .unwrap_or("(default)");
        println!("[effort] current: {current}");
        if let Some(option) = config_option(
            conversation,
            "thought_level",
            &[
                "thought_level",
                "reasoning",
                "reasoning_effort",
                "effort",
                "thinking",
                "thought",
            ],
        ) {
            print_config_values("[effort]", option);
        } else if self.config.protocol == ProtocolFlavor::CodexAppServer {
            println!("[effort] available: none, minimal, low, medium, high, xhigh");
        }
        Ok(())
    }

    fn print_mode_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let conversation = self
            .engine
            .conversations
            .get(&conversation_id)
            .ok_or("selected conversation missing")?;
        let current = conversation
            .context
            .mode
            .effective()
            .and_then(|mode| mode.as_ref())
            .map(|mode| mode.id.as_str())
            .unwrap_or("(default)");
        println!("[mode] current: {current}");
        if let Some(option) = config_option(conversation, "mode", &["mode"]) {
            print_config_values("[mode]", option);
        } else if let Some(modes) = &conversation.mode_state {
            let values = modes
                .available_modes
                .iter()
                .map(|mode| mode.id.as_str())
                .collect::<Vec<_>>();
            print_values("[mode]", &values);
        } else if self.config.protocol == ProtocolFlavor::CodexAppServer {
            println!("[mode] available: plan, default");
        }
        Ok(())
    }

    fn print_permission_state(&self) -> Result<(), Box<dyn Error>> {
        let conversation_id = self.selected_conversation()?;
        let conversation = self
            .engine
            .conversations
            .get(&conversation_id)
            .ok_or("selected conversation missing")?;
        let profile = conversation
            .context
            .permissions
            .effective()
            .map(|permissions| permissions.name.as_str())
            .unwrap_or("(default)");
        let approval = conversation
            .context
            .approvals
            .effective()
            .map(format_approval_policy)
            .unwrap_or("(default)");
        let sandbox = conversation
            .context
            .sandbox
            .effective()
            .map(format_sandbox_profile)
            .unwrap_or("(default)");
        println!("[permission] profile: {profile}; approval: {approval}; sandbox: {sandbox}");
        if let Some(option) = config_option(
            conversation,
            "permission",
            &[
                "permission",
                "permissions",
                "permission_profile",
                "approval",
                "approval_policy",
            ],
        )
        .or_else(|| config_option(conversation, "mode", &["mode"]))
        {
            print_config_values("[permission]", option);
        } else if self.config.protocol == ProtocolFlavor::CodexAppServer {
            println!(
                "[permission] commands: /permission <profile>, /approval <policy>, /sandbox <mode>"
            );
        }
        Ok(())
    }

    pub(super) fn print_command_summary(&self) {
        print_command_summary(&cli_commands(self.selected_available_commands()));
    }

    pub(super) fn print_available_commands(&self) {
        print_available_commands(&cli_commands(self.selected_available_commands()));
    }
}

fn cli_commands(commands: &[AvailableCommand]) -> Vec<CliCommandInfo> {
    commands
        .iter()
        .map(|command| CliCommandInfo {
            name: command.name.clone(),
            description: command.description.clone(),
            input_hint: command.input.as_ref().map(|input| input.hint.clone()),
        })
        .collect()
}

fn config_option<'a>(
    conversation: &'a ConversationState,
    category: &str,
    ids: &[&str],
) -> Option<&'a SessionConfigOption> {
    conversation
        .config_options
        .iter()
        .find(|option| option.category.as_deref() == Some(category))
        .or_else(|| {
            conversation.config_options.iter().find(|option| {
                ids.iter().any(|id| {
                    option.id.eq_ignore_ascii_case(id) || normalize(&option.id) == normalize(id)
                })
            })
        })
        .or_else(|| {
            conversation.config_options.iter().find(|option| {
                let name = normalize(&option.name);
                ids.iter().any(|id| name == normalize(id))
            })
        })
}

fn print_config_values(prefix: &str, option: &SessionConfigOption) {
    if option.values.is_empty() {
        println!("{prefix} option: {}", option.id);
        return;
    }
    let values = option
        .values
        .iter()
        .map(|value| value.value.as_str())
        .collect::<Vec<_>>();
    print_values(prefix, &values);
}

fn print_values(prefix: &str, values: &[&str]) {
    if values.is_empty() {
        return;
    }
    let shown = values
        .iter()
        .take(16)
        .copied()
        .collect::<Vec<_>>()
        .join(", ");
    let suffix = if values.len() > 16 { ", ..." } else { "" };
    println!("{prefix} available: {shown}{suffix}");
}

fn normalize(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn parse_approval_policy(value: &str) -> Option<ApprovalPolicy> {
    match value.to_ascii_lowercase().as_str() {
        "never" => Some(ApprovalPolicy::Never),
        "on-request" | "on_request" | "request" => Some(ApprovalPolicy::OnRequest),
        "on-failure" | "on_failure" | "failure" => Some(ApprovalPolicy::OnFailure),
        "untrusted" | "unless-trusted" | "unless_trusted" => Some(ApprovalPolicy::UnlessTrusted),
        _ => None,
    }
}

fn is_codex_reasoning_effort(value: &str) -> bool {
    matches!(
        value.to_ascii_lowercase().as_str(),
        "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
    )
}

fn parse_sandbox_profile(value: &str) -> Option<SandboxProfile> {
    match value.to_ascii_lowercase().as_str() {
        "read-only" | "read_only" | "readonly" => Some(SandboxProfile::ReadOnly),
        "workspace-write" | "workspace_write" | "workspace" => Some(SandboxProfile::WorkspaceWrite),
        "danger-full-access" | "danger_full_access" | "full-access" | "full" => {
            Some(SandboxProfile::FullAccess)
        }
        _ => None,
    }
}

fn format_approval_policy(policy: &ApprovalPolicy) -> &'static str {
    match policy {
        ApprovalPolicy::Never => "never",
        ApprovalPolicy::OnRequest => "on-request",
        ApprovalPolicy::OnFailure => "on-failure",
        ApprovalPolicy::UnlessTrusted => "untrusted",
    }
}

fn format_sandbox_profile(sandbox: &SandboxProfile) -> &str {
    match sandbox {
        SandboxProfile::ReadOnly => "read-only",
        SandboxProfile::WorkspaceWrite => "workspace-write",
        SandboxProfile::FullAccess => "danger-full-access",
        SandboxProfile::Custom(value) => value,
    }
}
