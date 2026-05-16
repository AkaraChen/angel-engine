use angel_engine::{
    AngelEngine, AuthMethodId, AvailableModeState, AvailablePermissionModeState, ContextPatch,
    ConversationId, ConversationLifecycle, ConversationState, DiscoverConversationsParams,
    ElicitationDecision, ElicitationId, ElicitationPhase, EngineCommand, EngineExtensionCommand,
    HistoryMutationOp, JsonRpcMessage, ResumeTarget, SessionMode, SessionPermissionMode,
    StartConversationParams, TransportClientInfo, TransportOptions, TransportOutput, TurnId,
    TurnOverrides, TurnState, UserAnswer, UserInput, UserInputKind,
};
use angel_provider::ProtocolAdapter;
use serde::{Deserialize, Serialize};

use crate::adapter::RuntimeAdapter;
use crate::config::{ClientOptions, StartConversationRequest};
use crate::error::ClientResult;
use crate::event::{
    ClientLog, ClientLogKind, ClientUpdate, JsonRpcOutbound, events_from_engine_event, log_event,
    stream_deltas_from_engine_event,
};
use crate::settings::{
    AvailableModeSettingSnapshot, AvailablePermissionModeSettingSnapshot, ModelListSettingSnapshot,
    ReasoningLevelSettingSnapshot, ThreadSettingsSnapshot,
};
use crate::snapshot::{ClientSnapshot, ElicitationSnapshot, TurnSnapshot};
use crate::thread::ThreadEvent;

#[derive(Debug)]
pub struct AngelClientCore<A = RuntimeAdapter> {
    engine: AngelEngine,
    adapter: A,
    options: TransportOptions,
    auto_authenticate: bool,
}

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

    pub fn initialize(&mut self) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::Initialize)
    }

    pub fn authenticate(
        &mut self,
        method_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::Authenticate {
            method: AuthMethodId::new(method_id.into()),
        })
    }

    pub fn discover_conversations(
        &mut self,
        request: DiscoveryRequest,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::DiscoverConversations {
            params: DiscoverConversationsParams {
                cwd: request.cwd,
                additional_directories: request.additional_directories,
                cursor: request.cursor,
            },
        })
    }

    pub fn start_conversation(
        &mut self,
        request: StartConversationRequest,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::StartConversation {
            params: StartConversationParams {
                cwd: request.cwd,
                additional_directories: request.additional_directories,
                context: ContextPatch::empty(),
            },
        })
    }

    pub fn resume_conversation(
        &mut self,
        request: ResumeConversationRequest,
    ) -> ClientResult<ClientCommandResult> {
        let target = if request.additional_directories.is_empty() {
            ResumeTarget::Remote {
                id: request.remote_id,
                hydrate: request.hydrate,
                cwd: request.cwd,
            }
        } else {
            ResumeTarget::RemoteWithContext {
                id: request.remote_id,
                hydrate: request.hydrate,
                cwd: request.cwd,
                additional_directories: request.additional_directories,
            }
        };
        self.plan_command(EngineCommand::ResumeConversation { target })
    }

    pub fn read_conversation(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::ReadConversation {
            conversation_id: to_conversation_id(conversation_id),
        })
    }

    pub fn fork_conversation(
        &mut self,
        request: ForkConversationRequest,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::ForkConversation {
            source: to_conversation_id(request.source_conversation_id),
            at: request.at_turn_id.map(to_turn_id),
        })
    }

    pub fn close_conversation(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::CloseConversation {
            conversation_id: to_conversation_id(conversation_id),
        })
    }

    pub fn unsubscribe(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::Unsubscribe {
            conversation_id: to_conversation_id(conversation_id),
        })
    }

    pub fn archive_conversation(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::ArchiveConversation {
            conversation_id: to_conversation_id(conversation_id),
        })
    }

    pub fn unarchive_conversation(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::UnarchiveConversation {
            conversation_id: to_conversation_id(conversation_id),
        })
    }

    pub fn compact_history(
        &mut self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::MutateHistory {
            conversation_id: to_conversation_id(conversation_id),
            op: HistoryMutationOp::Compact,
        })
    }

    pub fn rollback_history(
        &mut self,
        conversation_id: impl Into<String>,
        num_turns: usize,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::MutateHistory {
            conversation_id: to_conversation_id(conversation_id),
            op: HistoryMutationOp::Rollback { num_turns },
        })
    }

    pub fn run_shell_command(
        &mut self,
        conversation_id: impl Into<String>,
        command: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::RunShellCommand {
            conversation_id: to_conversation_id(conversation_id),
            command: command.into(),
        })
    }

    pub fn send_text(
        &mut self,
        conversation_id: impl Into<String>,
        text: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.send_inputs(
            conversation_id,
            vec![ClientInput::Text { text: text.into() }],
        )
    }

    pub fn send_inputs(
        &mut self,
        conversation_id: impl Into<String>,
        input: Vec<ClientInput>,
    ) -> ClientResult<ClientCommandResult> {
        let conversation_id = to_conversation_id(conversation_id);
        let input = input.into_iter().map(UserInput::from).collect::<Vec<_>>();
        if let Some(interpreted) =
            self.adapter
                .interpret_user_input(&self.engine, &conversation_id, &input)?
        {
            let mut result = self.plan_command(interpreted.command)?;
            result.message = interpreted.message;
            return Ok(result);
        }

        self.plan_command(EngineCommand::StartTurn {
            conversation_id,
            input,
            overrides: TurnOverrides::default(),
        })
    }

    pub fn steer_text(
        &mut self,
        conversation_id: impl Into<String>,
        turn_id: Option<String>,
        text: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_extension(EngineExtensionCommand::SteerTurn {
            conversation_id: to_conversation_id(conversation_id),
            turn_id: turn_id.map(to_turn_id),
            input: vec![UserInput::text(text.into())],
        })
    }

    pub fn cancel_turn(
        &mut self,
        conversation_id: impl Into<String>,
        turn_id: Option<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::CancelTurn {
            conversation_id: to_conversation_id(conversation_id),
            turn_id: turn_id.map(to_turn_id),
        })
    }

    pub fn resolve_elicitation(
        &mut self,
        conversation_id: impl Into<String>,
        elicitation_id: impl Into<String>,
        response: ElicitationResponse,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::ResolveElicitation {
            conversation_id: to_conversation_id(conversation_id),
            elicitation_id: ElicitationId::new(elicitation_id.into()),
            decision: response.into(),
        })
    }

    pub fn send_thread_event(
        &mut self,
        conversation_id: impl Into<String>,
        event: ThreadEvent,
        focused_turn_id: Option<String>,
    ) -> ClientResult<ClientCommandResult> {
        let conversation_id = conversation_id.into();
        match event {
            ThreadEvent::UserMessage { text } => self.send_text(conversation_id, text),
            ThreadEvent::Inputs { input } => self.send_inputs(conversation_id, input),
            ThreadEvent::Steer { text, turn_id } => {
                self.steer_text(conversation_id, turn_id.or(focused_turn_id), text)
            }
            ThreadEvent::Cancel { turn_id } => {
                self.cancel_turn(conversation_id, turn_id.or(focused_turn_id))
            }
            ThreadEvent::SetModel { model } => self.set_model(conversation_id, model),
            ThreadEvent::SetMode { mode } => self.set_mode(conversation_id, mode),
            ThreadEvent::SetPermissionMode { mode } => {
                self.set_permission_mode(conversation_id, mode)
            }
            ThreadEvent::SetReasoningEffort { effort } => {
                self.set_reasoning_effort(conversation_id, effort)
            }
            ThreadEvent::ResolveElicitation {
                elicitation_id,
                response,
            } => self.resolve_elicitation(conversation_id, elicitation_id, response),
            ThreadEvent::ResolveFirstElicitation { response } => {
                let elicitation_id = self.first_open_elicitation_id(&conversation_id)?;
                self.resolve_elicitation(conversation_id, elicitation_id, response)
            }
            ThreadEvent::Fork { at_turn_id } => self.fork_conversation(ForkConversationRequest {
                source_conversation_id: conversation_id,
                at_turn_id,
            }),
            ThreadEvent::Close => self.close_conversation(conversation_id),
            ThreadEvent::Unsubscribe => self.unsubscribe(conversation_id),
            ThreadEvent::Archive => self.archive_conversation(conversation_id),
            ThreadEvent::Unarchive => self.unarchive_conversation(conversation_id),
            ThreadEvent::CompactHistory => self.compact_history(conversation_id),
            ThreadEvent::RollbackHistory { num_turns } => {
                self.rollback_history(conversation_id, num_turns)
            }
            ThreadEvent::RunShellCommand { command } => {
                self.run_shell_command(conversation_id, command)
            }
        }
    }

    pub fn set_model(
        &mut self,
        conversation_id: impl Into<String>,
        model: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let plan = self
            .engine
            .set_model(to_conversation_id(conversation_id), model.into())?;
        self.apply_plan(plan)
    }

    pub fn set_mode(
        &mut self,
        conversation_id: impl Into<String>,
        mode: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let conversation_id = to_conversation_id(conversation_id);
        let settings = self.engine.get_available_modes(conversation_id.clone())?;
        let mode = resolve_mode_request(&settings, &mode.into());
        let plan = self.engine.set_mode(conversation_id, mode)?;
        self.apply_plan(plan)
    }

    pub fn set_permission_mode(
        &mut self,
        conversation_id: impl Into<String>,
        mode: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let conversation_id = to_conversation_id(conversation_id);
        let settings = self.engine.get_permission_modes(conversation_id.clone())?;
        let mode = resolve_permission_mode_request(&settings, &mode.into());
        let plan = self.engine.set_permission_mode(conversation_id, mode)?;
        self.apply_plan(plan)
    }

    pub fn set_reasoning_level(
        &mut self,
        conversation_id: impl Into<String>,
        level: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        let plan = self
            .engine
            .set_reasoning_level(to_conversation_id(conversation_id), level.into())?;
        self.apply_plan(plan)
    }

    pub fn set_reasoning_effort(
        &mut self,
        conversation_id: impl Into<String>,
        effort: impl Into<String>,
    ) -> ClientResult<ClientCommandResult> {
        self.set_reasoning_level(conversation_id, effort)
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

    pub fn conversation_is_idle(&self, conversation_id: &str) -> bool {
        self.conversation(conversation_id)
            .is_some_and(|conversation| {
                matches!(conversation.lifecycle, ConversationLifecycle::Idle)
            })
    }

    pub fn turn_is_terminal(&self, conversation_id: &str, turn_id: &str) -> bool {
        self.turn(conversation_id, turn_id)
            .is_some_and(TurnState::is_terminal)
    }

    pub fn turn_snapshot(&self, conversation_id: &str, turn_id: &str) -> Option<TurnSnapshot> {
        self.turn(conversation_id, turn_id).map(TurnSnapshot::from)
    }

    pub fn open_elicitations(
        &self,
        conversation_id: &str,
    ) -> ClientResult<Vec<ElicitationSnapshot>> {
        let conversation =
            self.conversation(conversation_id)
                .ok_or_else(|| crate::ClientError::InvalidInput {
                    message: format!("conversation {conversation_id} does not exist"),
                })?;
        Ok(conversation
            .elicitations
            .values()
            .filter(|elicitation| matches!(elicitation.phase, ElicitationPhase::Open))
            .map(ElicitationSnapshot::from)
            .collect())
    }

    pub fn thread_settings(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ThreadSettingsSnapshot> {
        Ok(self
            .engine
            .conversation_settings(to_conversation_id(conversation_id))?
            .into())
    }

    pub fn reasoning_level(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ReasoningLevelSettingSnapshot> {
        Ok(self
            .engine
            .get_reasoning_level(to_conversation_id(conversation_id))?
            .into())
    }

    pub fn model_list(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<ModelListSettingSnapshot> {
        Ok(self
            .engine
            .get_model_list(to_conversation_id(conversation_id))?
            .into())
    }

    pub(crate) fn hydrate_model_catalog_from_runtime_debug(
        &mut self,
        conversation_id: impl Into<String>,
        result: &serde_json::Value,
    ) -> ClientResult<()> {
        let conversation_id = conversation_id.into();
        let current_model_id = self
            .engine
            .get_model_list(to_conversation_id(conversation_id.clone()))?
            .current_model_id;

        let Some(models) = self
            .adapter
            .model_catalog_from_runtime_debug(result, current_model_id.as_deref())
        else {
            return Ok(());
        };
        self.engine
            .hydrate_model_list(to_conversation_id(conversation_id), models)?;
        Ok(())
    }

    pub(crate) fn needs_runtime_model_catalog(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<bool> {
        let model_list = self
            .engine
            .get_model_list(to_conversation_id(conversation_id))?;
        Ok(model_list.can_set && model_list.available_models.is_empty())
    }

    pub fn available_modes(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<AvailableModeSettingSnapshot> {
        Ok(self
            .engine
            .get_available_modes(to_conversation_id(conversation_id))?
            .into())
    }

    pub fn permission_modes(
        &self,
        conversation_id: impl Into<String>,
    ) -> ClientResult<AvailablePermissionModeSettingSnapshot> {
        Ok(self
            .engine
            .get_permission_modes(to_conversation_id(conversation_id))?
            .into())
    }

    fn first_open_elicitation_id(&self, conversation_id: &str) -> ClientResult<String> {
        self.open_elicitations(conversation_id)?
            .into_iter()
            .next()
            .map(|elicitation| elicitation.id)
            .ok_or_else(|| crate::ClientError::InvalidInput {
                message: format!("conversation {conversation_id} has no open elicitation"),
            })
    }

    fn plan_command(&mut self, command: EngineCommand) -> ClientResult<ClientCommandResult> {
        let plan = self.engine.plan_command(command)?;
        self.apply_plan(plan)
    }

    fn plan_extension(
        &mut self,
        command: EngineExtensionCommand,
    ) -> ClientResult<ClientCommandResult> {
        self.plan_command(EngineCommand::Extension(command))
    }

    fn conversation(&self, conversation_id: &str) -> Option<&ConversationState> {
        self.engine
            .conversations
            .get(&to_conversation_id(conversation_id))
    }

    fn turn(&self, conversation_id: &str, turn_id: &str) -> Option<&TurnState> {
        self.conversation(conversation_id)?
            .turns
            .get(&to_turn_id(turn_id))
    }

    fn apply_plan(&mut self, plan: angel_engine::CommandPlan) -> ClientResult<ClientCommandResult> {
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

fn to_conversation_id(id: impl Into<String>) -> ConversationId {
    ConversationId::new(id.into())
}

fn to_turn_id(id: impl Into<String>) -> TurnId {
    TurnId::new(id.into())
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientCommandResult {
    pub conversation_id: Option<String>,
    pub turn_id: Option<String>,
    pub request_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub update: ClientUpdate,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryRequest {
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub additional_directories: Vec<String>,
    #[serde(default)]
    pub cursor: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeConversationRequest {
    pub remote_id: String,
    #[serde(default)]
    pub hydrate: bool,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub additional_directories: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkConversationRequest {
    pub source_conversation_id: String,
    #[serde(default)]
    pub at_turn_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ClientInput {
    Text {
        text: String,
    },
    Image {
        data: String,
        mime_type: String,
        #[serde(default)]
        name: Option<String>,
    },
    ResourceLink {
        name: String,
        uri: String,
        #[serde(default)]
        mime_type: Option<String>,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        description: Option<String>,
    },
    FileMention {
        name: String,
        path: String,
        #[serde(default)]
        mime_type: Option<String>,
    },
    EmbeddedTextResource {
        uri: String,
        text: String,
        #[serde(default)]
        mime_type: Option<String>,
    },
    EmbeddedBlobResource {
        uri: String,
        data: String,
        #[serde(default)]
        mime_type: Option<String>,
        #[serde(default)]
        name: Option<String>,
    },
    RawContentBlock {
        value: serde_json::Value,
    },
}

impl ClientInput {
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text { text: text.into() }
    }

    pub fn resource_link(name: impl Into<String>, uri: impl Into<String>) -> Self {
        Self::ResourceLink {
            name: name.into(),
            uri: uri.into(),
            mime_type: None,
            title: None,
            description: None,
        }
    }

    pub fn file_mention(
        name: impl Into<String>,
        path: impl Into<String>,
        mime_type: Option<String>,
    ) -> Self {
        Self::FileMention {
            name: name.into(),
            path: path.into(),
            mime_type,
        }
    }

    pub fn embedded_text_resource(uri: impl Into<String>, text: impl Into<String>) -> Self {
        Self::EmbeddedTextResource {
            uri: uri.into(),
            text: text.into(),
            mime_type: None,
        }
    }

    pub fn embedded_blob_resource(
        uri: impl Into<String>,
        data: impl Into<String>,
        mime_type: Option<String>,
        name: Option<String>,
    ) -> Self {
        Self::EmbeddedBlobResource {
            uri: uri.into(),
            data: data.into(),
            mime_type,
            name,
        }
    }

    pub fn image(
        data: impl Into<String>,
        mime_type: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        Self::Image {
            data: data.into(),
            mime_type: mime_type.into(),
            name,
        }
    }

    pub fn raw_content_block(value: serde_json::Value) -> Self {
        Self::RawContentBlock { value }
    }
}

impl From<ClientInput> for UserInput {
    fn from(input: ClientInput) -> Self {
        match input {
            ClientInput::Text { text } => UserInput::text(text),
            ClientInput::Image {
                data,
                mime_type,
                name,
            } => UserInput::image(data, mime_type, name),
            ClientInput::ResourceLink {
                name,
                uri,
                mime_type,
                title,
                description,
            } => UserInput {
                content: uri.clone(),
                kind: UserInputKind::ResourceLink {
                    name,
                    uri,
                    mime_type,
                    title,
                    description,
                },
            },
            ClientInput::FileMention {
                name,
                path,
                mime_type,
            } => UserInput::file_mention(name, path, mime_type),
            ClientInput::EmbeddedTextResource {
                uri,
                text,
                mime_type,
            } => UserInput::embedded_text_resource(uri, text, mime_type),
            ClientInput::EmbeddedBlobResource {
                uri,
                data,
                mime_type,
                name,
            } => UserInput::embedded_blob_resource(uri, data, mime_type, name),
            ClientInput::RawContentBlock { value } => UserInput::raw_content_block(value),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ElicitationResponse {
    Allow,
    AllowForSession,
    Deny,
    Cancel,
    Answers { answers: Vec<ClientAnswer> },
    DynamicToolResult { success: bool },
    ExternalComplete,
    Raw { value: String },
}

impl ElicitationResponse {
    pub fn answers(answers: impl IntoIterator<Item = ClientAnswer>) -> Self {
        Self::Answers {
            answers: answers.into_iter().collect(),
        }
    }

    pub fn raw(value: impl Into<String>) -> Self {
        Self::Raw {
            value: value.into(),
        }
    }
}

impl From<ElicitationResponse> for ElicitationDecision {
    fn from(response: ElicitationResponse) -> Self {
        match response {
            ElicitationResponse::Allow => Self::Allow,
            ElicitationResponse::AllowForSession => Self::AllowForSession,
            ElicitationResponse::Deny => Self::Deny,
            ElicitationResponse::Cancel => Self::Cancel,
            ElicitationResponse::Answers { answers } => Self::Answers(
                answers
                    .into_iter()
                    .map(|answer| UserAnswer {
                        id: answer.id,
                        value: answer.value,
                    })
                    .collect(),
            ),
            ElicitationResponse::DynamicToolResult { success } => {
                Self::DynamicToolResult { success }
            }
            ElicitationResponse::ExternalComplete => Self::ExternalComplete,
            ElicitationResponse::Raw { value } => Self::Raw(value),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientAnswer {
    pub id: String,
    pub value: String,
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

fn resolve_mode_request(settings: &AvailableModeState, requested: &str) -> String {
    let requested = requested.trim();
    if requested.is_empty()
        || settings.available_modes.is_empty()
        || settings
            .available_modes
            .iter()
            .any(|mode| mode.id == requested)
    {
        return requested.to_string();
    }

    let normalized = normalized_mode_key(requested);
    settings
        .available_modes
        .iter()
        .find(|mode| mode_matches_request(mode, &normalized))
        .map(|mode| mode.id.clone())
        .unwrap_or_else(|| requested.to_string())
}

fn resolve_permission_mode_request(
    settings: &AvailablePermissionModeState,
    requested: &str,
) -> String {
    let requested = requested.trim();
    if requested.is_empty()
        || settings.available_modes.is_empty()
        || settings
            .available_modes
            .iter()
            .any(|mode| mode.id == requested)
    {
        return requested.to_string();
    }

    let normalized = normalized_mode_key(requested);
    settings
        .available_modes
        .iter()
        .find(|mode| permission_mode_matches_request(mode, &normalized))
        .map(|mode| mode.id.clone())
        .unwrap_or_else(|| requested.to_string())
}

fn mode_matches_request(mode: &SessionMode, requested: &str) -> bool {
    normalized_mode_key(&mode.name) == requested
        || mode
            .id
            .rsplit(['#', '/', ':'])
            .next()
            .is_some_and(|suffix| normalized_mode_key(suffix) == requested)
}

fn permission_mode_matches_request(mode: &SessionPermissionMode, requested: &str) -> bool {
    normalized_mode_key(&mode.name) == requested
        || mode
            .id
            .rsplit(['#', '/', ':'])
            .next()
            .is_some_and(|suffix| normalized_mode_key(suffix) == requested)
}

fn normalized_mode_key(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}
