use angel_engine::{AngelEngine, TransportOptions};

use crate::adapter::RuntimeAdapter;

mod conversation;
mod resolution;
mod settings_query;
mod transport;
mod types;

pub use types::{
    ClientAnswer, ClientCommandResult, ClientInput, DiscoveryRequest, ElicitationResponse,
    ForkConversationRequest, ResumeConversationRequest,
};

pub(crate) use transport::process_log;

#[derive(Debug)]
pub struct AngelClientCore<A = RuntimeAdapter> {
    engine: AngelEngine,
    adapter: A,
    options: TransportOptions,
    auto_authenticate: bool,
}
