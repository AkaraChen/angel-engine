use std::collections::HashSet;

use angel_engine::{AngelEngine, ProtocolFlavor, TransportOptions};
use test_cli::{InlinePrinter, RuntimeProcess};

use plan_hints::PlanReadyHint;

mod elicitation;
mod lifecycle;
mod plan_hints;
mod repl;
mod settings;

#[derive(Clone, Copy, Debug)]
pub struct ShellConfig {
    pub binary: &'static str,
    pub args: &'static [&'static str],
    pub protocol: ProtocolFlavor,
    pub client_name: &'static str,
    pub client_title: &'static str,
    pub process_label: &'static str,
    pub banner: &'static str,
    pub prompt: &'static str,
    pub direct_shell: bool,
}

pub struct ProtocolShell<A> {
    process: RuntimeProcess,
    printer: InlinePrinter,
    engine: AngelEngine,
    adapter: A,
    options: TransportOptions,
    config: ShellConfig,
    pending_plan_ready_hint: Option<PlanReadyHint>,
    printed_plan_ready_hints: HashSet<String>,
}
