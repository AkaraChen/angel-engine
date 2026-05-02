use std::error::Error;

use angel_engine::ProtocolFlavor;
use angel_engine::adapters::acp::AcpAdapter;

mod common;

use common::{ProtocolShell, ShellConfig};

fn main() -> Result<(), Box<dyn Error>> {
    let adapter = AcpAdapter::standard();
    let capabilities = adapter.capabilities();
    let config = ShellConfig {
        binary: "kimi",
        args: &["acp"],
        protocol: ProtocolFlavor::Acp,
        client_name: "kimi-shell-demo",
        client_title: "Kimi Shell Demo",
        process_label: "kimi",
        banner: "kimi-shell demo",
        prompt: "kimi-shell> ",
        direct_shell: false,
    };
    let mut shell = ProtocolShell::start(adapter, capabilities, config)?;
    shell.initialize()?;
    shell.run_repl()
}
