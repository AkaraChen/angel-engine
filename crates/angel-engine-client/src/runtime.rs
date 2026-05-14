use serde::{Deserialize, Serialize};
use strum::Display;

use crate::{ClientAuthOptions, ClientIdentity, ClientOptions, ClientProtocol};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Display)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum AgentRuntime {
    #[default]
    Codex,
    Kimi,
    Opencode,
    Qoder,
    Copilot,
    Gemini,
    Cursor,
    Cline,
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

pub fn create_runtime_options(
    runtime_name: Option<&str>,
    overrides: RuntimeOptionsOverrides,
) -> RuntimeOptions {
    let runtime = match runtime_name
        .map(|s| s.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("kimi") => AgentRuntime::Kimi,
        Some("opencode") => AgentRuntime::Opencode,
        Some("qoder") => AgentRuntime::Qoder,
        Some("copilot") => AgentRuntime::Copilot,
        Some("gemini") => AgentRuntime::Gemini,
        Some("cursor") => AgentRuntime::Cursor,
        Some("cline") => AgentRuntime::Cline,
        _ => AgentRuntime::Codex,
    };
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
        AgentRuntime::Qoder => ClientOptions {
            args: overrides
                .args
                .clone()
                .unwrap_or_else(|| vec!["--acp".to_string()]),
            auth: overrides.auth.unwrap_or(ClientAuthOptions {
                auto_authenticate: false,
                need_auth: false,
            }),
            command: command_override.unwrap_or_else(|| "qodercli".to_string()),
            identity,
            protocol: ClientProtocol::Qoder,
            ..ClientOptions::builder().build()
        },
        AgentRuntime::Copilot => ClientOptions {
            args: overrides
                .args
                .clone()
                .unwrap_or_else(|| vec!["--acp".to_string(), "--stdio".to_string()]),
            auth: overrides.auth.unwrap_or(ClientAuthOptions {
                auto_authenticate: false,
                need_auth: false,
            }),
            command: command_override.unwrap_or_else(|| "copilot".to_string()),
            identity,
            protocol: ClientProtocol::Copilot,
            ..ClientOptions::builder().build()
        },
        AgentRuntime::Gemini => ClientOptions {
            args: overrides
                .args
                .clone()
                .unwrap_or_else(|| vec!["--acp".to_string()]),
            auth: overrides.auth.unwrap_or(ClientAuthOptions {
                auto_authenticate: true,
                need_auth: true,
            }),
            command: command_override.unwrap_or_else(|| "gemini".to_string()),
            identity,
            protocol: ClientProtocol::Gemini,
            ..ClientOptions::builder().build()
        },
        AgentRuntime::Cursor => ClientOptions {
            args: overrides
                .args
                .clone()
                .unwrap_or_else(|| vec!["acp".to_string()]),
            auth: overrides.auth.unwrap_or(ClientAuthOptions {
                auto_authenticate: true,
                need_auth: true,
            }),
            command: command_override.unwrap_or_else(|| "agent".to_string()),
            identity,
            protocol: ClientProtocol::Cursor,
            ..ClientOptions::builder().build()
        },
        AgentRuntime::Cline => ClientOptions {
            args: overrides
                .args
                .clone()
                .unwrap_or_else(|| vec!["--acp".to_string()]),
            auth: overrides.auth.unwrap_or(ClientAuthOptions {
                auto_authenticate: false,
                need_auth: false,
            }),
            command: command_override.unwrap_or_else(|| "cline".to_string()),
            identity,
            protocol: ClientProtocol::Cline,
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

    #[test]
    fn gemini_runtime_uses_gemini_adapter_protocol() {
        let options = create_runtime_options(Some("gemini"), RuntimeOptionsOverrides::default());

        assert_eq!(options.runtime, AgentRuntime::Gemini);
        assert_eq!(options.client.protocol, ClientProtocol::Gemini);
        assert_eq!(options.client.command, "gemini");
        assert_eq!(options.client.args, vec!["--acp"]);
    }

    #[test]
    fn qoder_runtime_uses_qoder_adapter_protocol() {
        let options = create_runtime_options(Some("qoder"), RuntimeOptionsOverrides::default());

        assert_eq!(options.runtime, AgentRuntime::Qoder);
        assert_eq!(options.client.protocol, ClientProtocol::Qoder);
        assert_eq!(options.client.command, "qodercli");
        assert_eq!(options.client.args, vec!["--acp"]);
    }

    #[test]
    fn copilot_runtime_uses_copilot_adapter_protocol() {
        let options = create_runtime_options(Some("copilot"), RuntimeOptionsOverrides::default());

        assert_eq!(options.runtime, AgentRuntime::Copilot);
        assert_eq!(options.client.protocol, ClientProtocol::Copilot);
        assert_eq!(options.client.command, "copilot");
        assert_eq!(options.client.args, vec!["--acp", "--stdio"]);
    }

    #[test]
    fn cursor_runtime_uses_cursor_adapter_protocol() {
        let options = create_runtime_options(Some("cursor"), RuntimeOptionsOverrides::default());

        assert_eq!(options.runtime, AgentRuntime::Cursor);
        assert_eq!(options.client.protocol, ClientProtocol::Cursor);
        assert_eq!(options.client.command, "agent");
        assert_eq!(options.client.args, vec!["acp"]);
    }

    #[test]
    fn cline_runtime_uses_cline_adapter_protocol() {
        let options = create_runtime_options(Some("cline"), RuntimeOptionsOverrides::default());

        assert_eq!(options.runtime, AgentRuntime::Cline);
        assert_eq!(options.client.protocol, ClientProtocol::Cline);
        assert_eq!(options.client.command, "cline");
        assert_eq!(options.client.args, vec!["--acp"]);
    }

    #[test]
    fn runtime_display_uses_canonical_lowercase_ids() {
        assert_eq!(AgentRuntime::Copilot.to_string(), "copilot");
        assert_eq!(AgentRuntime::Qoder.to_string(), "qoder");
        assert_eq!(AgentRuntime::Cursor.to_string(), "cursor");
    }

    #[test]
    fn compatibility_aliases_are_not_runtime_names() {
        for name in [
            "qodercli",
            "github-copilot",
            "githubcopilot",
            "gemini-cli",
            "geminicli",
            "cursor-agent",
            "agent",
            "open-code",
        ] {
            let options = create_runtime_options(Some(name), RuntimeOptionsOverrides::default());

            assert_eq!(options.runtime, AgentRuntime::Codex);
        }
    }
}
