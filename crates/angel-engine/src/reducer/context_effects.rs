use crate::settings::{
    find_mode_config_option, find_model_config_option, find_permission_mode_config_option,
    find_reasoning_config_option,
};
use crate::state::{
    AgentMode, ContextPatch, ContextScope, ContextUpdate, PermissionMode, ReasoningProfile,
    SessionConfigOption,
};

pub(super) fn sync_context_from_config_options(
    context: &mut crate::EffectiveContext,
    options: &[SessionConfigOption],
) {
    if let Some(option) = find_model_config_option(options) {
        context.apply_patch(ContextPatch::one(ContextUpdate::Model {
            scope: ContextScope::TurnAndFuture,
            model: Some(option.current_value.clone()),
        }));
    }
    if let Some(option) = find_mode_config_option(options) {
        context.apply_patch(ContextPatch::one(ContextUpdate::Mode {
            scope: ContextScope::TurnAndFuture,
            mode: Some(AgentMode {
                id: option.current_value.clone(),
            }),
        }));
    }
    if let Some(option) = find_permission_mode_config_option(options) {
        context.apply_patch(ContextPatch::one(ContextUpdate::PermissionMode {
            scope: ContextScope::TurnAndFuture,
            mode: Some(PermissionMode {
                id: option.current_value.clone(),
            }),
        }));
    }
    if let Some(option) = find_reasoning_config_option(options) {
        context.apply_patch(ContextPatch::one(ContextUpdate::Reasoning {
            scope: ContextScope::TurnAndFuture,
            reasoning: Some(ReasoningProfile {
                effort: Some(option.current_value.clone()),
            }),
        }));
    }
}
