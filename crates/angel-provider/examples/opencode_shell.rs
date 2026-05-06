use std::error::Error;

use angel_engine::ProtocolFlavor;
use angel_provider::acp::AcpAdapter;

mod common;

use common::{ProtocolShell, ShellConfig};

fn main() -> Result<(), Box<dyn Error>> {
    let adapter = AcpAdapter::without_authentication();
    let capabilities = adapter.capabilities();
    let config = ShellConfig {
        binary: "opencode",
        args: &["acp"],
        protocol: ProtocolFlavor::Acp,
        client_name: "opencode-shell-demo",
        client_title: "OpenCode Shell Demo",
        process_label: "opencode",
        banner: "opencode-shell demo",
        prompt: "opencode-shell> ",
        direct_shell: false,
    };
    let mut shell = ProtocolShell::start(adapter, capabilities, config)?;
    shell.initialize()?;
    shell.run_repl()
}
