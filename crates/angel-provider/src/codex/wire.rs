use angel_engine::ProtocolMethod;

#[allow(dead_code)]
pub(crate) mod schema {
    include!(concat!(env!("OUT_DIR"), "/codex_app_server_protocol_v2.rs"));
}

#[allow(dead_code)]
pub(crate) mod constants {
    include!(concat!(
        env!("OUT_DIR"),
        "/codex_app_server_protocol_v2_constants.rs"
    ));
}

use constants::ClientRequestMethod;

pub(crate) use constants::ThreadItemType as CodexThreadItemKind;

pub(crate) fn codex_client_request_method(method: &ProtocolMethod) -> Option<ClientRequestMethod> {
    match method {
        ProtocolMethod::Authenticate => Some(ClientRequestMethod::AccountLoginStart),
        ProtocolMethod::Initialize => Some(ClientRequestMethod::Initialize),
        ProtocolMethod::ListConversations => Some(ClientRequestMethod::ThreadList),
        ProtocolMethod::ReadConversation => Some(ClientRequestMethod::ThreadRead),
        ProtocolMethod::StartConversation => Some(ClientRequestMethod::ThreadStart),
        ProtocolMethod::ResumeConversation => Some(ClientRequestMethod::ThreadResume),
        ProtocolMethod::ForkConversation => Some(ClientRequestMethod::ThreadFork),
        ProtocolMethod::StartTurn => Some(ClientRequestMethod::TurnStart),
        ProtocolMethod::SteerTurn => Some(ClientRequestMethod::TurnSteer),
        ProtocolMethod::CancelTurn => Some(ClientRequestMethod::TurnInterrupt),
        ProtocolMethod::ArchiveConversation => Some(ClientRequestMethod::ThreadArchive),
        ProtocolMethod::UnarchiveConversation => Some(ClientRequestMethod::ThreadUnarchive),
        ProtocolMethod::CompactHistory => Some(ClientRequestMethod::ThreadCompactStart),
        ProtocolMethod::RollbackHistory => Some(ClientRequestMethod::ThreadRollback),
        ProtocolMethod::InjectHistoryItems => Some(ClientRequestMethod::ThreadInjectItems),
        ProtocolMethod::CloseConversation => Some(ClientRequestMethod::ThreadClose),
        ProtocolMethod::Unsubscribe => Some(ClientRequestMethod::ThreadUnsubscribe),
        ProtocolMethod::RunShellCommand => Some(ClientRequestMethod::ThreadShellCommand),
        _ => None,
    }
}
