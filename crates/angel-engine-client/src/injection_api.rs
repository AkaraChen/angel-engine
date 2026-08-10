//! Host injection query/apply API over client options and adapters.

use angel_engine::{
    CapabilitySupport, EngineError, MCP_INJECT_CAPABILITY, McpInjectionConfig,
    ensure_mcp_injection_allowed,
};
use angel_provider::ProtocolAdapter;

use crate::adapter::RuntimeAdapter;
use crate::config::ClientOptions;
use crate::error::{ClientError, ClientResult};

/// Query whether the adapter selected by `options.protocol` accepts MCP server
/// descriptors on session start/load/fork.
///
/// This is available **before** a conversation exists so hosts can choose
/// Skill-only vs MCP inject per agent.
pub fn mcp_injection_capability(options: &ClientOptions) -> CapabilitySupport {
    RuntimeAdapter::from_options(options)
        .capabilities()
        .mcp
        .inject
}

/// True when [`mcp_injection_capability`] is Supported or Extension.
pub fn can_inject_mcp(options: &ClientOptions) -> bool {
    mcp_injection_capability(options).is_supported()
}

/// Validate `options.mcp_injection` against the adapter capability.
///
/// Empty injection always succeeds. Non-empty injection returns
/// [`EngineError::CapabilityUnsupported`] with capability `mcp.inject` when
/// the adapter does not support host MCP config.
pub fn ensure_mcp_injection_for_options(options: &ClientOptions) -> ClientResult<()> {
    ensure_mcp_injection_allowed(&options.mcp_injection, &mcp_injection_capability(options))
        .map_err(ClientError::from)
}

/// Apply MCP injection config, or return a structured capability error.
pub fn inject_mcp_into_options(
    options: &mut ClientOptions,
    injection: McpInjectionConfig,
) -> ClientResult<()> {
    ensure_mcp_injection_allowed(&injection, &mcp_injection_capability(options))
        .map_err(ClientError::from)?;
    options.mcp_injection = injection;
    Ok(())
}

/// Map an inject failure to the canonical capability error (for tests/docs).
pub fn mcp_inject_unsupported_error() -> EngineError {
    EngineError::CapabilityUnsupported {
        capability: MCP_INJECT_CAPABILITY.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use angel_engine::{McpServerConfig, McpServerTransport};
    use std::collections::BTreeMap;

    fn sample_injection() -> McpInjectionConfig {
        McpInjectionConfig {
            servers: vec![McpServerConfig {
                name: "angel-host".into(),
                transport: McpServerTransport::Stdio {
                    command: "angel-mcp".into(),
                    args: vec!["serve".into()],
                    env: BTreeMap::new(),
                },
            }],
        }
    }

    #[test]
    fn acp_protocol_reports_mcp_inject_supported() {
        let options = ClientOptions::builder()
            .acp("opencode")
            .need_auth(false)
            .build();
        assert!(can_inject_mcp(&options));
        assert_eq!(
            mcp_injection_capability(&options),
            CapabilitySupport::Supported
        );
        ensure_mcp_injection_for_options(&ClientOptions {
            mcp_injection: sample_injection(),
            ..options
        })
        .expect("acp accepts inject");
    }

    #[test]
    fn codex_protocol_reports_mcp_inject_unsupported() {
        let options = ClientOptions::builder().codex_app_server("codex").build();
        assert!(!can_inject_mcp(&options));
        assert_eq!(
            mcp_injection_capability(&options),
            CapabilitySupport::Unsupported
        );

        let err = ensure_mcp_injection_for_options(&ClientOptions {
            mcp_injection: sample_injection(),
            ..options.clone()
        })
        .expect_err("codex rejects non-empty inject");
        match err {
            ClientError::Engine(EngineError::CapabilityUnsupported { capability }) => {
                assert_eq!(capability, MCP_INJECT_CAPABILITY);
            }
            other => panic!("expected CapabilityUnsupported, got {other}"),
        }

        ensure_mcp_injection_for_options(&options).expect("empty inject ok on codex");
    }

    #[test]
    fn cursor_protocol_reports_mcp_inject_supported_without_history_feature() {
        let options = ClientOptions::builder().cursor("agent").build();
        assert!(can_inject_mcp(&options));
        assert_eq!(
            mcp_injection_capability(&options),
            CapabilitySupport::Supported
        );
        ensure_mcp_injection_for_options(&ClientOptions {
            mcp_injection: sample_injection(),
            ..options
        })
        .expect("cursor ACP accepts inject independently of local history");
    }

    #[test]
    fn inject_mcp_into_options_writes_when_supported() {
        let mut options = ClientOptions::builder()
            .acp("opencode")
            .need_auth(false)
            .build();
        inject_mcp_into_options(&mut options, sample_injection()).expect("inject");
        assert_eq!(options.mcp_injection.servers.len(), 1);
        assert_eq!(options.mcp_injection.servers[0].name, "angel-host");
    }

    #[test]
    fn inject_mcp_into_options_errors_when_unsupported() {
        let mut options = ClientOptions::builder().codex_app_server("codex").build();
        let err = inject_mcp_into_options(&mut options, sample_injection())
            .expect_err("codex inject must fail");
        assert!(matches!(
            err,
            ClientError::Engine(EngineError::CapabilityUnsupported { .. })
        ));
        assert!(options.mcp_injection.is_empty());
    }
}
