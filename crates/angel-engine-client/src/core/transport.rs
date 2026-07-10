use angel_engine::{
    AngelEngine, EngineCommand, EngineExtensionCommand, JsonRpcMessage, TransportClientInfo,
    TransportOptions, TransportOutput,
};
use angel_provider::ProtocolAdapter;

use crate::adapter::RuntimeAdapter;
use crate::config::ClientOptions;
use crate::error::ClientResult;
use crate::event::{
    ClientLog, ClientLogKind, ClientUpdate, JsonRpcOutbound, events_from_engine_event, log_event,
    stream_deltas_from_engine_event,
};
use crate::snapshot::ClientSnapshot;

use super::AngelClientCore;
use super::types::ClientCommandResult;

impl AngelClientCore<RuntimeAdapter> {
    pub fn new(options: ClientOptions) -> Self {
        let adapter = RuntimeAdapter::from_options(&options);
        Self::new_with_adapter(options, adapter)
    }
}

impl<A> AngelClientCore<A>
where
    A: ProtocolAdapter,
{
    pub fn new_with_adapter(options: ClientOptions, adapter: A) -> Self {
        let mut client_info = TransportClientInfo::new(
            options.identity.name,
            options
                .identity
                .version
                .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string()),
        );
        client_info.title = options.identity.title;
        let engine = AngelEngine::new(adapter.protocol_flavor(), adapter.capabilities());
        Self {
            engine,
            adapter,
            options: TransportOptions {
                client_info,
                experimental_api: options.experimental_api,
            },
            auto_authenticate: options.auth.auto_authenticate,
        }
    }

    pub fn auto_authenticate(&self) -> bool {
        self.auto_authenticate
    }

    pub fn snapshot(&self) -> ClientSnapshot {
        ClientSnapshot::from(&self.engine)
    }

    pub fn selected_conversation_id(&self) -> Option<String> {
        self.engine.selected.as_ref().map(ToString::to_string)
    }

    pub fn receive_json_line(&mut self, line: &str) -> ClientResult<ClientUpdate> {
        let value = serde_json::from_str(line)?;
        self.receive_json_value(value)
    }

    pub fn receive_json_value(&mut self, value: serde_json::Value) -> ClientResult<ClientUpdate> {
        let message = JsonRpcMessage::from_value(value)?;
        let output = self.adapter.decode_message(&self.engine, &message)?;
        self.apply_transport_output(output)
    }

    pub(super) fn plan_command(
        &mut self,
        command: EngineCommand,
    ) -> ClientResult<ClientCommandResult> {
        let plan = self.engine.plan_command(command)?;
        self.apply_plan(plan)
    }

    pub(super) fn plan_extension(
        &mut self,
        command: EngineExtensionCommand,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::Extension(command))
    }

    pub(super) fn apply_plan(
        &mut self,
        plan: angel_engine::CommandPlan,
    ) -> ClientResult<ClientCommandResult> {
        let conversation_id = plan.conversation_id.as_ref().map(ToString::to_string);
        let turn_id = plan.turn_id.as_ref().map(ToString::to_string);
        let request_id = plan.request_id.as_ref().map(ToString::to_string);
        let mut update = ClientUpdate::default();
        for effect in plan.effects {
            let output = self
                .adapter
                .encode_effect(&self.engine, &effect, &self.options)?;
            update.merge(self.apply_transport_output(output)?);
        }
        Ok(ClientCommandResult {
            conversation_id,
            message: None,
            turn_id,
            request_id,
            update,
        })
    }

    fn apply_transport_output(&mut self, output: TransportOutput) -> ClientResult<ClientUpdate> {
        let mut update = ClientUpdate::default();
        for message in &output.messages {
            update
                .outgoing
                .push(JsonRpcOutbound::from_message(message)?);
        }
        for log in &output.logs {
            let log = ClientLog::from(log);
            update.events.push(log_event(log.clone()));
            update.logs.push(log);
        }
        for event in &output.events {
            self.engine.apply_event(event.clone())?;
            update
                .stream_deltas
                .extend(stream_deltas_from_engine_event(&self.engine, event)?);
            update
                .events
                .extend(events_from_engine_event(&self.engine, event)?);
        }
        for request_id in output.completed_requests {
            self.engine.pending.remove(&request_id);
            update.completed_request_ids.push(request_id.to_string());
        }
        Ok(update)
    }
}

pub(crate) fn process_log(kind: ClientLogKind, message: impl Into<String>) -> ClientUpdate {
    let log = ClientLog {
        kind,
        message: message.into(),
    };
    ClientUpdate {
        events: vec![log_event(log.clone())],
        logs: vec![log],
        ..ClientUpdate::default()
    }
}
