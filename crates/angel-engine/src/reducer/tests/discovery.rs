use crate::adapters::acp::AcpAdapter;
use crate::adapters::codex::CodexAdapter;
use crate::capabilities::{CapabilitySupport, RuntimeCapabilities};
use crate::command::{
    DiscoverConversationsParams, EngineCommand, ResumeTarget, StartConversationParams,
};
use crate::event::EngineEvent;
use crate::ids::{ConversationId, RemoteConversationId};
use crate::protocol::{AcpMethod, CodexMethod, ProtocolFlavor, ProtocolMethod};
use crate::reducer::{AngelEngine, PendingRequest};
use crate::state::{ContextPatch, ContextScope, ContextUpdate, ConversationLifecycle};

use super::engine_with;

#[test]
fn acp_discovery_carries_common_filters() {
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());

    let plan = engine
        .plan_command(EngineCommand::DiscoverConversations {
            params: DiscoverConversationsParams {
                cwd: Some("/tmp/project".to_string()),
                cursor: Some("opaque".to_string()),
            },
        })
        .expect("discover conversations");

    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::Acp(AcpMethod::SessionList)
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("cwd"),
        Some(&"/tmp/project".to_string())
    );
    assert_eq!(
        plan.effects[0].payload.fields.get("cursor"),
        Some(&"opaque".to_string())
    );
    let request_id = plan.request_id.expect("request id");
    assert!(matches!(
        engine.pending.requests.get(&request_id),
        Some(PendingRequest::DiscoverConversations { params })
            if params.cwd.as_deref() == Some("/tmp/project")
                && params.cursor.as_deref() == Some("opaque")
    ));
}

#[test]
fn codex_discovery_carries_common_filters() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());

    let plan = engine
        .plan_command(EngineCommand::DiscoverConversations {
            params: DiscoverConversationsParams {
                cwd: Some("/tmp/project".to_string()),
                cursor: Some("opaque".to_string()),
            },
        })
        .expect("discover conversations");

    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::Codex(CodexMethod::ThreadList)
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("cwd"),
        Some(&"/tmp/project".to_string())
    );
    assert_eq!(
        plan.effects[0].payload.fields.get("cursor"),
        Some(&"opaque".to_string())
    );
}

#[test]
fn negotiated_capabilities_gate_common_discovery() {
    let adapter = AcpAdapter::standard();
    let mut engine = AngelEngine::new(ProtocolFlavor::Acp, adapter.capabilities());
    let mut capabilities = adapter.capabilities();
    capabilities.lifecycle.list = CapabilitySupport::Unsupported;
    engine
        .apply_event(EngineEvent::RuntimeNegotiated {
            capabilities: RuntimeCapabilities::new("acp"),
            conversation_capabilities: Some(capabilities),
        })
        .expect("runtime negotiated");

    let error = engine
        .plan_command(EngineCommand::DiscoverConversations {
            params: DiscoverConversationsParams::default(),
        })
        .expect_err("discover should be gated");

    assert!(matches!(
        error,
        crate::EngineError::CapabilityUnsupported { capability }
            if capability == "conversation.list"
    ));
}

#[test]
fn resume_requires_negotiated_common_capability() {
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());

    let error = engine
        .plan_command(EngineCommand::ResumeConversation {
            target: ResumeTarget::Remote {
                id: "sess".to_string(),
                hydrate: false,
            },
        })
        .expect_err("resume should be gated");

    assert!(matches!(
        error,
        crate::EngineError::CapabilityUnsupported { capability }
            if capability == "conversation.resume"
    ));
}

#[test]
fn start_conversation_carries_only_common_create_fields() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());

    let plan = engine
        .plan_command(EngineCommand::StartConversation {
            params: StartConversationParams {
                cwd: Some("/tmp/project".to_string()),
                context: ContextPatch::empty(),
            },
        })
        .expect("start conversation");

    assert_eq!(
        plan.effects[0].payload.fields.get("cwd"),
        Some(&"/tmp/project".to_string())
    );
    assert!(!plan.effects[0].payload.fields.contains_key("serviceName"));
    assert!(!plan.effects[0].payload.fields.contains_key("ephemeral"));
}

#[test]
fn acp_discovered_conversation_resumes_with_remote_id() {
    let adapter = AcpAdapter::standard();
    let mut engine = engine_with(ProtocolFlavor::Acp, adapter.capabilities());
    let mut capabilities = adapter.capabilities();
    capabilities.lifecycle.load = CapabilitySupport::Supported;
    let conversation_id = ConversationId::new("disc");
    engine
        .apply_event(EngineEvent::ConversationDiscovered {
            id: conversation_id.clone(),
            remote: RemoteConversationId::AcpSession("sess".to_string()),
            context: title_patch("Fix tests"),
            capabilities,
        })
        .expect("discover");

    let plan = engine
        .plan_command(EngineCommand::ResumeConversation {
            target: ResumeTarget::Conversation(conversation_id.clone()),
        })
        .expect("resume discovered conversation");

    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::Acp(AcpMethod::SessionLoad)
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("remoteConversationId"),
        Some(&"sess".to_string())
    );
    assert_eq!(
        plan.effects[0].payload.fields.get("hydrate"),
        Some(&"true".to_string())
    );
    let conversation = &engine.conversations[&conversation_id];
    assert!(matches!(
        conversation.lifecycle,
        ConversationLifecycle::Hydrating { .. }
    ));
    assert_eq!(
        conversation
            .context
            .raw
            .get("conversation.title")
            .and_then(|title| title.effective())
            .map(String::as_str),
        Some("Fix tests")
    );
}

#[test]
fn codex_discovered_conversation_resumes_with_remote_id() {
    let adapter = CodexAdapter::app_server();
    let mut engine = engine_with(ProtocolFlavor::CodexAppServer, adapter.capabilities());
    let conversation_id = ConversationId::new("disc");
    engine
        .apply_event(EngineEvent::ConversationDiscovered {
            id: conversation_id.clone(),
            remote: RemoteConversationId::CodexThread("thread".to_string()),
            context: ContextPatch::empty(),
            capabilities: adapter.capabilities(),
        })
        .expect("discover");

    let plan = engine
        .plan_command(EngineCommand::ResumeConversation {
            target: ResumeTarget::Conversation(conversation_id),
        })
        .expect("resume discovered conversation");

    assert!(matches!(
        &plan.effects[0].method,
        ProtocolMethod::Codex(CodexMethod::ThreadResume)
    ));
    assert_eq!(
        plan.effects[0].payload.fields.get("remoteConversationId"),
        Some(&"thread".to_string())
    );
    assert_eq!(
        plan.effects[0].payload.fields.get("hydrate"),
        Some(&"true".to_string())
    );
}

fn title_patch(title: &str) -> ContextPatch {
    ContextPatch::one(ContextUpdate::Raw {
        scope: ContextScope::Conversation,
        key: "conversation.title".to_string(),
        value: title.to_string(),
    })
}
