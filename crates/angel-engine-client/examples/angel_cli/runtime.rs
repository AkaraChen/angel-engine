use std::error::Error;

use angel_engine_client::ClientOptions;

#[derive(Clone, Copy, Debug)]
pub(super) enum RuntimeKind {
    Kimi,
    Codex,
    OpenCode,
    Qoder,
    Copilot,
    Gemini,
    Cursor,
    Cline,
}

impl RuntimeKind {
    pub(super) fn from_arg(value: Option<&str>) -> Result<Self, Box<dyn Error>> {
        match value.unwrap_or("kimi") {
            "kimi" => Ok(Self::Kimi),
            "codex" => Ok(Self::Codex),
            "opencode" => Ok(Self::OpenCode),
            "qoder" => Ok(Self::Qoder),
            "copilot" => Ok(Self::Copilot),
            "gemini" => Ok(Self::Gemini),
            "cursor" => Ok(Self::Cursor),
            "cline" => Ok(Self::Cline),
            other => Err(format!(
                "unknown runtime {other}; use kimi, codex, opencode, qoder, copilot, gemini, cursor, or cline"
            )
            .into()),
        }
    }

    pub(super) fn options(self) -> ClientOptions {
        match self {
            Self::Kimi => ClientOptions::builder()
                .kimi("kimi")
                .arg("acp")
                .need_auth(true)
                .auto_authenticate(true)
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
            Self::Codex => ClientOptions::builder()
                .codex_app_server("codex")
                .arg("app-server")
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
            Self::OpenCode => ClientOptions::builder()
                .acp("opencode")
                .arg("acp")
                .need_auth(false)
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
            Self::Qoder => ClientOptions::builder()
                .acp("qodercli")
                .arg("--acp")
                .need_auth(false)
                .auto_authenticate(false)
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
            Self::Copilot => ClientOptions::builder()
                .acp("copilot")
                .arg("--acp")
                .arg("--stdio")
                .need_auth(false)
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
            Self::Gemini => ClientOptions::builder()
                .gemini("gemini")
                .arg("--acp")
                .need_auth(true)
                .auto_authenticate(true)
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
            Self::Cursor => ClientOptions::builder()
                .acp("agent")
                .arg("acp")
                .need_auth(true)
                .auto_authenticate(true)
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
            Self::Cline => ClientOptions::builder()
                .acp("cline")
                .arg("--acp")
                .need_auth(false)
                .client_name("angel-client-cli")
                .client_title("Angel Client CLI")
                .build(),
        }
    }

    pub(super) fn banner(self) -> &'static str {
        match self {
            Self::Kimi => "angel-client kimi cli",
            Self::Codex => "angel-client codex cli",
            Self::OpenCode => "angel-client opencode cli",
            Self::Qoder => "angel-client qoder cli",
            Self::Copilot => "angel-client copilot cli",
            Self::Gemini => "angel-client gemini cli",
            Self::Cursor => "angel-client cursor cli",
            Self::Cline => "angel-client cline cli",
        }
    }

    pub(super) fn prompt(self) -> &'static str {
        match self {
            Self::Kimi => "kimi> ",
            Self::Codex => "codex> ",
            Self::OpenCode => "opencode> ",
            Self::Qoder => "qoder> ",
            Self::Copilot => "copilot> ",
            Self::Gemini => "gemini> ",
            Self::Cursor => "cursor> ",
            Self::Cline => "cline> ",
        }
    }

    pub(super) fn supports_shell(self) -> bool {
        matches!(self, Self::Codex)
    }

    pub(super) fn is_codex(self) -> bool {
        matches!(self, Self::Codex)
    }
}
