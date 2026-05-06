use std::error::Error;

use angel_engine::ProtocolFlavor;
use angel_provider::codex::CodexAdapter;

mod common;

use common::{ProtocolShell, ShellConfig};

fn main() -> Result<(), Box<dyn Error>> {
    let adapter = CodexAdapter::app_server();
    let capabilities = adapter.capabilities();
    let config = ShellConfig {
        binary: "codex",
        args: &["app-server"],
        protocol: ProtocolFlavor::CodexAppServer,
        client_name: "codex-shell-demo",
        client_title: "Codex Shell Demo",
        process_label: "codex",
        banner: "codex-shell demo",
        prompt: "codex-shell> ",
        direct_shell: true,
    };
    let mut shell = ProtocolShell::start(adapter, capabilities, config)?;
    shell.initialize()?;
    shell.run_repl()
}
