use super::*;

impl CodexAdapter {
    pub(super) fn decode_refresh_skills_response(
        &self,
        mut output: TransportOutput,
        id: &JsonRpcRequestId,
        conversation_id: &ConversationId,
        result: &Value,
    ) -> Result<TransportOutput, angel_engine::EngineError> {
        let skills = codex_skills_from_response(result)?;
        output = output
            .event(EngineEvent::SessionSkillsUpdated {
                conversation_id: conversation_id.clone(),
                skills,
            })
            .log(TransportLogKind::Receive, format!("response {id}"));
        Ok(output)
    }
}

fn codex_skills_from_response(
    result: &Value,
) -> Result<Vec<angel_engine::state::Skill>, angel_engine::EngineError> {
    let mut skills = Vec::new();
    for entry in result
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        for skill in entry
            .get("skills")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let name = skill.get("name").and_then(Value::as_str).ok_or_else(|| {
                angel_engine::EngineError::InvalidCommand {
                    message: "Codex skill metadata is missing name".to_string(),
                }
            })?;
            let path = skill.get("path").and_then(Value::as_str).ok_or_else(|| {
                angel_engine::EngineError::InvalidCommand {
                    message: "Codex skill metadata is missing path".to_string(),
                }
            })?;
            let description = skill
                .get("description")
                .and_then(Value::as_str)
                .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                    message: "Codex skill metadata is missing description".to_string(),
                })?;
            let scope = codex_skill_scope(skill.get("scope").and_then(Value::as_str))?;
            let enabled = skill
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or_else(|| angel_engine::EngineError::InvalidCommand {
                    message: "Codex skill metadata is missing enabled".to_string(),
                })?;
            skills.push(angel_engine::state::Skill {
                name: name.to_string(),
                description: description.to_string(),
                path: path.to_string(),
                scope,
                enabled,
            });
        }
    }
    Ok(skills)
}

fn codex_skill_scope(
    value: Option<&str>,
) -> Result<angel_engine::state::SkillScope, angel_engine::EngineError> {
    match value {
        Some("user") => Ok(angel_engine::state::SkillScope::User),
        Some("repo") => Ok(angel_engine::state::SkillScope::Repo),
        Some("system") => Ok(angel_engine::state::SkillScope::System),
        Some("admin") => Ok(angel_engine::state::SkillScope::Admin),
        other => Err(angel_engine::EngineError::InvalidCommand {
            message: format!("unknown Codex skill scope: {other:?}"),
        }),
    }
}
