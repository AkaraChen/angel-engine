use std::collections::HashSet;
use std::process::{Child, ChildStdin};
use std::sync::mpsc::Receiver;

use angel_engine::{AngelEngine, ProtocolFlavor, TransportOptions};

use plan_hints::PlanReadyHint;
use transport_io::AppLine;

mod elicitation;
mod lifecycle;
mod plan_hints;
mod repl;
mod settings;
mod transport_io;

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
    child: Child,
    child_stdin: ChildStdin,
    lines: Receiver<AppLine>,
    engine: AngelEngine,
    adapter: A,
    options: TransportOptions,
    config: ShellConfig,
    pending_plan_ready_hint: Option<PlanReadyHint>,
    printed_plan_ready_hints: HashSet<String>,
}

impl<A> Drop for ProtocolShell<A> {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
