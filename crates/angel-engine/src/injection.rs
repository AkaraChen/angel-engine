//! Host → agent capability injection (Skill first, MCP as extension slot).
//!
//! Skill injection is the Stage 3/4 primary path: the host owns skill package
//! directories and may materialize them into runtime skill roots. MCP injection is
//! a typed config slot only — adapters that understand `mcpServers` (ACP)
//! forward descriptors; there is no host MCP server implementation here.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::capabilities::CapabilitySupport;
use crate::error::EngineError;

/// Capability id returned by [`CapabilitySupport::require`] / client errors when
/// MCP host injection is not available on the adapter.
pub const MCP_INJECT_CAPABILITY: &str = "mcp.inject";

/// Capability id for host skill package injection (filesystem materialization).
pub const SKILL_INJECT_CAPABILITY: &str = "skills.inject";

/// Reject non-empty MCP injection when the adapter does not support it.
///
/// Empty config is always allowed (no-op). Non-empty config requires
/// [`CapabilitySupport::is_supported`] on `mcp.inject`.
pub fn ensure_mcp_injection_allowed(
    injection: &McpInjectionConfig,
    support: &CapabilitySupport,
) -> Result<(), EngineError> {
    if injection.is_empty() {
        return Ok(());
    }
    support.require(MCP_INJECT_CAPABILITY)
}

/// Host-owned skill injection for a runtime or conversation scope.
///
/// Lifecycle: apply **before** the first turn of a new session (and re-apply
/// when the host skill set changes), then refresh the skills list so composer
/// mention / agent loaders see the packages.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInjectionConfig {
    /// Canonical skill directories owned by the host (read-only for agents).
    /// Each entry is a directory that may contain skill packages
    /// (`<name>/SKILL.md`) or nested groups.
    #[serde(default)]
    pub roots: Vec<PathBuf>,
    /// Skill names the host guarantees to inject (e.g. `["angel-host"]`).
    /// Used when materializing into runtime skill roots.
    #[serde(default)]
    pub ensure: Vec<String>,
    /// When true, the host/client may symlink or copy ensured skills into each
    /// runtime's native global skill directories so agents that only scan those
    /// paths still load them.
    #[serde(default)]
    pub materialize_into_runtime_roots: bool,
}

impl SkillInjectionConfig {
    pub fn is_empty(&self) -> bool {
        self.roots.is_empty() && self.ensure.is_empty()
    }
}

/// How a host-injected MCP server is reached. Extension point only — no server
/// process is started by angel-engine itself.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum McpServerTransport {
    /// Local stdio process (ACP `mcpServers` command form).
    #[serde(rename = "stdio")]
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: BTreeMap<String, String>,
    },
    /// Server-sent events transport.
    #[serde(rename = "sse")]
    Sse { url: String },
    /// Streamable HTTP transport.
    #[serde(rename = "http")]
    Http { url: String },
}

/// One MCP server descriptor to pass into an agent session.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub name: String,
    pub transport: McpServerTransport,
}

/// Host-owned MCP injection. Default is empty; Stage 3 does not implement a
/// host MCP server — only the config shape and adapter plumbing.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpInjectionConfig {
    #[serde(default)]
    pub servers: Vec<McpServerConfig>,
}

impl McpInjectionConfig {
    pub fn is_empty(&self) -> bool {
        self.servers.is_empty()
    }

    /// Encode as ACP `session/new` / `session/load` / fork `mcpServers` array.
    pub fn to_acp_mcp_servers(&self) -> Value {
        Value::Array(
            self.servers
                .iter()
                .map(McpServerConfig::to_acp_value)
                .collect(),
        )
    }
}

impl McpServerConfig {
    /// ACP wire object for a single server.
    ///
    /// Stdio uses the common `{ name, command, args, env }` shape. SSE/HTTP
    /// add a `type` discriminator so future runtimes can branch without
    /// inventing a second config type.
    pub fn to_acp_value(&self) -> Value {
        match &self.transport {
            McpServerTransport::Stdio {
                command,
                args,
                env,
            } => {
                let env_obj: BTreeMap<&str, &str> = env
                    .iter()
                    .map(|(k, v)| (k.as_str(), v.as_str()))
                    .collect();
                json!({
                    "name": self.name,
                    "command": command,
                    "args": args,
                    "env": env_obj,
                })
            }
            McpServerTransport::Sse { url } => json!({
                "name": self.name,
                "type": "sse",
                "url": url,
            }),
            McpServerTransport::Http { url } => json!({
                "name": self.name,
                "type": "http",
                "url": url,
            }),
        }
    }
}

/// Combined host injection surface (skill preferred; MCP optional extension).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HostInjectionConfig {
    #[serde(default)]
    pub skill: SkillInjectionConfig,
    #[serde(default)]
    pub mcp: McpInjectionConfig,
}

impl HostInjectionConfig {
    pub fn is_empty(&self) -> bool {
        self.skill.is_empty() && self.mcp.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acp_stdio_server_omits_type_discriminator() {
        let server = McpServerConfig {
            name: "angel-host".into(),
            transport: McpServerTransport::Stdio {
                command: "angel-mcp".into(),
                args: vec!["serve".into()],
                env: BTreeMap::from([("ANGEL_DAEMON_URL".into(), "http://127.0.0.1".into())]),
            },
        };
        assert_eq!(
            server.to_acp_value(),
            json!({
                "name": "angel-host",
                "command": "angel-mcp",
                "args": ["serve"],
                "env": { "ANGEL_DAEMON_URL": "http://127.0.0.1" },
            })
        );
    }

    #[test]
    fn acp_sse_server_includes_type() {
        let server = McpServerConfig {
            name: "remote".into(),
            transport: McpServerTransport::Sse {
                url: "https://example.test/sse".into(),
            },
        };
        assert_eq!(
            server.to_acp_value(),
            json!({
                "name": "remote",
                "type": "sse",
                "url": "https://example.test/sse",
            })
        );
    }

    #[test]
    fn empty_mcp_injection_encodes_empty_array() {
        assert_eq!(
            McpInjectionConfig::default().to_acp_mcp_servers(),
            json!([])
        );
    }

    #[test]
    fn skill_injection_round_trips_json() {
        let config = SkillInjectionConfig {
            roots: vec![PathBuf::from("/app/skills")],
            ensure: vec!["angel-host".into()],
            materialize_into_runtime_roots: true,
        };
        let value = serde_json::to_value(&config).unwrap();
        let back: SkillInjectionConfig = serde_json::from_value(value).unwrap();
        assert_eq!(back, config);
    }

    #[test]
    fn empty_mcp_injection_is_allowed_even_when_unsupported() {
        ensure_mcp_injection_allowed(
            &McpInjectionConfig::default(),
            &CapabilitySupport::Unsupported,
        )
        .expect("empty inject is a no-op");
    }

    #[test]
    fn non_empty_mcp_injection_requires_support() {
        let injection = McpInjectionConfig {
            servers: vec![McpServerConfig {
                name: "stub".into(),
                transport: McpServerTransport::Stdio {
                    command: "true".into(),
                    args: Vec::new(),
                    env: BTreeMap::new(),
                },
            }],
        };
        let err = ensure_mcp_injection_allowed(&injection, &CapabilitySupport::Unsupported)
            .expect_err("unsupported inject must fail");
        assert_eq!(
            err,
            EngineError::CapabilityUnsupported {
                capability: MCP_INJECT_CAPABILITY.to_string(),
            }
        );
        ensure_mcp_injection_allowed(&injection, &CapabilitySupport::Supported)
            .expect("supported inject ok");
    }
}
