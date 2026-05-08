use serde::{Deserialize, Serialize};

use crate::{ClientAuthOptions, ClientIdentity, ClientOptions, ClientProtocol};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentRuntime {
    #[default]
    Codex,
    Kimi,
    Opencode,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeOptionsOverrides {
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub auth: Option<ClientAuthOptions>,
    #[serde(default)]
    pub identity: Option<ClientIdentity>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub additional_directories: Option<Vec<String>>,
    #[serde(default)]
    pub experimental_api: Option<bool>,
    #[serde(default)]
    pub process_label: Option<String>,
    #[serde(default)]
    pub client_name: Option<String>,
    #[serde(default)]
    pub client_title: Option<String>,
    #[serde(default)]
    pub default_reasoning_effort: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeOptions {
    #[serde(flatten)]
    pub client: ClientOptions,
    #[serde(default)]
    pub runtime: AgentRuntime,
    #[serde(default)]
    pub default_reasoning_effort: Option<String>,
}

impl RuntimeOptions {
    pub fn client_options(&self) -> ClientOptions {
        self.client.clone()
    }
}

pub fn normalize_runtime_name(runtime: Option<&str>) -> AgentRuntime {
    match runtime
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "kimi" => AgentRuntime::Kimi,
        "opencode" | "open-code" | "open code" => AgentRuntime::Opencode,
        _ => AgentRuntime::Codex,
    }
}

pub fn create_runtime_options(
    runtime_name: Option<&str>,
    overrides: RuntimeOptionsOverrides,
) -> RuntimeOptions {
    let runtime = normalize_runtime_name(runtime_name);
    let command_override = overrides
        .command
        .clone()
        .or_else(|| std::env::var("ANGEL_ENGINE_COMMAND").ok());
    let identity = overrides
        .identity
        .clone()
        .unwrap_or_else(|| ClientIdentity {
            name: overrides
                .client_name
                .clone()
                .unwrap_or_else(|| "angel-engine-client-node".to_string()),
            title: Some(
                overrides
                    .client_title
                    .clone()
                    .unwrap_or_else(|| "Angel Engine Client".to_string()),
            ),
            version: None,
        });

    let mut client = match runtime {
        AgentRuntime::Kimi => ClientOptions {
            args: overrides
                .args
                .clone()
                .unwrap_or_else(|| vec!["acp".to_string()]),
            auth: overrides.auth.unwrap_or(ClientAuthOptions {
                auto_authenticate: true,
                need_auth: true,
            }),
            command: command_override.unwrap_or_else(|| "kimi".to_string()),
            identity,
            protocol: ClientProtocol::Kimi,
            ..ClientOptions::builder().build()
        },
        AgentRuntime::Opencode => ClientOptions {
            args: overrides
                .args
                .clone()
                .unwrap_or_else(|| vec!["acp".to_string()]),
            auth: overrides.auth.unwrap_or(ClientAuthOptions {
                auto_authenticate: false,
                need_auth: false,
            }),
            command: command_override.unwrap_or_else(|| "opencode".to_string()),
            identity,
            protocol: ClientProtocol::Acp,
            ..ClientOptions::builder().build()
        },
        AgentRuntime::Codex => ClientOptions {
            args: overrides
                .args
                .clone()
                .unwrap_or_else(|| vec!["app-server".to_string()]),
            command: command_override.unwrap_or_else(|| "codex".to_string()),
            identity,
            protocol: ClientProtocol::CodexAppServer,
            ..ClientOptions::builder().build()
        },
    };

    if let Some(cwd) = overrides.cwd {
        client.cwd = Some(cwd);
    }
    if let Some(additional_directories) = overrides.additional_directories {
        client.additional_directories = additional_directories;
    }
    if let Some(experimental_api) = overrides.experimental_api {
        client.experimental_api = experimental_api;
    }
    if let Some(process_label) = overrides.process_label {
        client.process_label = Some(process_label);
    }

    RuntimeOptions {
        client,
        runtime,
        default_reasoning_effort: overrides.default_reasoning_effort,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kimi_runtime_uses_kimi_adapter_protocol() {
        let options = create_runtime_options(Some("kimi"), RuntimeOptionsOverrides::default());

        assert_eq!(options.runtime, AgentRuntime::Kimi);
        assert_eq!(options.client.protocol, ClientProtocol::Kimi);
        assert_eq!(options.client.command, "kimi");
        assert_eq!(options.client.args, vec!["acp"]);
    }

    #[test]
    fn opencode_runtime_stays_on_generic_acp_adapter() {
        let options = create_runtime_options(Some("opencode"), RuntimeOptionsOverrides::default());

        assert_eq!(options.runtime, AgentRuntime::Opencode);
        assert_eq!(options.client.protocol, ClientProtocol::Acp);
        assert_eq!(options.client.command, "opencode");
        assert_eq!(options.client.args, vec!["acp"]);
    }
}
