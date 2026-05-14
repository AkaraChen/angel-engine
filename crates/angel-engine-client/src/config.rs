use garde::Validate;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ClientOptions {
    #[garde(length(min = 1))]
    pub command: String,
    #[serde(default)]
    #[garde(skip)]
    pub args: Vec<String>,
    #[serde(default)]
    #[garde(skip)]
    pub protocol: ClientProtocol,
    #[serde(default)]
    #[garde(skip)]
    pub auth: ClientAuthOptions,
    #[serde(default)]
    #[garde(skip)]
    pub identity: ClientIdentity,
    #[serde(default)]
    #[garde(skip)]
    pub cwd: Option<String>,
    #[serde(default)]
    #[garde(skip)]
    pub additional_directories: Vec<String>,
    #[serde(default = "default_experimental_api")]
    #[garde(skip)]
    pub experimental_api: bool,
    #[serde(default)]
    #[garde(skip)]
    pub process_label: Option<String>,
}

impl ClientOptions {
    pub fn builder() -> ClientOptionsBuilder {
        ClientOptionsBuilder::default()
    }

    pub fn acp(command: impl Into<String>) -> Self {
        Self::builder().acp(command).build()
    }

    pub fn kimi(command: impl Into<String>) -> Self {
        Self::builder().kimi(command).build()
    }

    pub fn gemini(command: impl Into<String>) -> Self {
        Self::builder().gemini(command).build()
    }

    pub fn qoder(command: impl Into<String>) -> Self {
        Self::builder().qoder(command).build()
    }

    pub fn copilot(command: impl Into<String>) -> Self {
        Self::builder().copilot(command).build()
    }

    pub fn cursor(command: impl Into<String>) -> Self {
        Self::builder().cursor(command).build()
    }

    pub fn cline(command: impl Into<String>) -> Self {
        Self::builder().cline(command).build()
    }

    pub fn codex_app_server(command: impl Into<String>) -> Self {
        Self::builder().codex_app_server(command).build()
    }

    pub fn custom(command: impl Into<String>) -> Self {
        Self::builder().custom(command).build()
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClientProtocol {
    #[default]
    Acp,
    Kimi,
    Gemini,
    Qoder,
    Copilot,
    Cursor,
    Cline,
    CodexAppServer,
    Custom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAuthOptions {
    #[serde(default = "default_need_auth")]
    pub need_auth: bool,
    #[serde(default = "default_auto_authenticate")]
    pub auto_authenticate: bool,
}

impl Default for ClientAuthOptions {
    fn default() -> Self {
        Self {
            need_auth: true,
            auto_authenticate: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientIdentity {
    pub name: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
}

impl Default for ClientIdentity {
    fn default() -> Self {
        Self {
            name: "angel-engine-client".to_string(),
            title: Some("Angel Engine Client".to_string()),
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClientOptionsBuilder {
    options: ClientOptions,
}

impl ClientOptionsBuilder {
    pub fn acp(mut self, command: impl Into<String>) -> Self {
        self.options.protocol = ClientProtocol::Acp;
        self.options.command = command.into();
        self
    }

    pub fn kimi(mut self, command: impl Into<String>) -> Self {
        self.options.protocol = ClientProtocol::Kimi;
        self.options.command = command.into();
        self
    }

    pub fn gemini(mut self, command: impl Into<String>) -> Self {
        self.options.protocol = ClientProtocol::Gemini;
        self.options.command = command.into();
        self
    }

    pub fn qoder(mut self, command: impl Into<String>) -> Self {
        self.options.protocol = ClientProtocol::Qoder;
        self.options.command = command.into();
        self
    }

    pub fn copilot(mut self, command: impl Into<String>) -> Self {
        self.options.protocol = ClientProtocol::Copilot;
        self.options.command = command.into();
        self
    }

    pub fn cursor(mut self, command: impl Into<String>) -> Self {
        self.options.protocol = ClientProtocol::Cursor;
        self.options.command = command.into();
        self
    }

    pub fn cline(mut self, command: impl Into<String>) -> Self {
        self.options.protocol = ClientProtocol::Cline;
        self.options.command = command.into();
        self
    }

    pub fn codex_app_server(mut self, command: impl Into<String>) -> Self {
        self.options.protocol = ClientProtocol::CodexAppServer;
        self.options.command = command.into();
        self
    }

    pub fn custom(mut self, command: impl Into<String>) -> Self {
        self.options.protocol = ClientProtocol::Custom;
        self.options.command = command.into();
        self
    }

    pub fn command(mut self, command: impl Into<String>) -> Self {
        self.options.command = command.into();
        self
    }

    pub fn arg(mut self, arg: impl Into<String>) -> Self {
        self.options.args.push(arg.into());
        self
    }

    pub fn args(mut self, args: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.options.args.extend(args.into_iter().map(Into::into));
        self
    }

    pub fn need_auth(mut self, value: bool) -> Self {
        self.options.auth.need_auth = value;
        self
    }

    pub fn auto_authenticate(mut self, value: bool) -> Self {
        self.options.auth.auto_authenticate = value;
        self
    }

    pub fn client_name(mut self, name: impl Into<String>) -> Self {
        self.options.identity.name = name.into();
        self
    }

    pub fn client_title(mut self, title: impl Into<String>) -> Self {
        self.options.identity.title = Some(title.into());
        self
    }

    pub fn client_version(mut self, version: impl Into<String>) -> Self {
        self.options.identity.version = Some(version.into());
        self
    }

    pub fn cwd(mut self, cwd: impl Into<String>) -> Self {
        self.options.cwd = Some(cwd.into());
        self
    }

    pub fn additional_directory(mut self, directory: impl Into<String>) -> Self {
        self.options.additional_directories.push(directory.into());
        self
    }

    pub fn experimental_api(mut self, value: bool) -> Self {
        self.options.experimental_api = value;
        self
    }

    pub fn process_label(mut self, label: impl Into<String>) -> Self {
        self.options.process_label = Some(label.into());
        self
    }

    pub fn build(self) -> ClientOptions {
        self.options
    }
}

impl Default for ClientOptionsBuilder {
    fn default() -> Self {
        Self {
            options: ClientOptions {
                command: String::new(),
                args: Vec::new(),
                protocol: ClientProtocol::Acp,
                auth: ClientAuthOptions::default(),
                identity: ClientIdentity::default(),
                cwd: None,
                additional_directories: Vec::new(),
                experimental_api: default_experimental_api(),
                process_label: None,
            },
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartConversationRequest {
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub additional_directories: Vec<String>,
}

impl StartConversationRequest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cwd(mut self, cwd: impl Into<String>) -> Self {
        self.cwd = Some(cwd.into());
        self
    }

    pub fn additional_directory(mut self, directory: impl Into<String>) -> Self {
        self.additional_directories.push(directory.into());
        self
    }
}

fn default_experimental_api() -> bool {
    true
}

fn default_need_auth() -> bool {
    true
}

fn default_auto_authenticate() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_options_apply_field_defaults_when_partially_deserialized() {
        let options: ClientOptions = serde_json::from_value(serde_json::json!({
            "command": "opencode",
            "auth": {
                "needAuth": false
            }
        }))
        .unwrap();

        assert!(!options.auth.need_auth);
        assert!(options.auth.auto_authenticate);
    }
}
