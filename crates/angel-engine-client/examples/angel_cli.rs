use std::env;
use std::error::Error;

use angel_engine_client::AngelClient;
use test_cli::InlinePrinter;

#[path = "angel_cli/elicitation.rs"]
mod elicitation;
#[path = "angel_cli/render.rs"]
mod render;
#[path = "angel_cli/runtime.rs"]
mod runtime;
#[path = "angel_cli/session.rs"]
mod session;
#[path = "angel_cli/settings.rs"]
mod settings;

use runtime::RuntimeKind;

fn main() -> Result<(), Box<dyn Error>> {
    let runtime = RuntimeKind::from_arg(env::args().nth(1).as_deref())?;
    let mut cli = MultiRuntimeCli::spawn(runtime)?;
    cli.initialize_and_start()?;
    cli.run_repl()
}

struct MultiRuntimeCli {
    printer: InlinePrinter,
    client: AngelClient,
    runtime: RuntimeKind,
    conversation_id: Option<String>,
}
