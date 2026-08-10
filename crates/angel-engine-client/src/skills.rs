use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use aghub_agents::AgentDescriptor;
use aghub_agents::agents;
use angel_engine::SkillInjectionConfig;

use crate::snapshot::{SkillScopeSnapshot, SkillSnapshot};

/// Filesystem-based skill discovery for a runtime, without booting the agent.
///
/// Skill directory conventions per runtime come from the `aghub-agents`
/// descriptors and SKILL.md parsing from the `skill` crate, so runtimes whose
/// adapters cannot list skills over the wire (or whose processes are too slow
/// to boot just for a catalog) still get a skill list. Project-scope skills
/// shadow global skills with the same name. Runtimes without a known skill
/// directory convention resolve to an empty list.
pub fn list_agent_skills(runtime: &str, project_root: Option<&Path>) -> Vec<SkillSnapshot> {
    list_agent_skills_with_injection(runtime, project_root, &SkillInjectionConfig::default())
}

/// Like [`list_agent_skills`], but merges host-injected skill roots first.
///
/// Host roots use [`SkillScopeSnapshot::System`] so product-owned packages
/// (e.g. `angel-host`) are distinguishable from user/repo skills. Project and
/// user skills still shadow host skills with the same name (scan order:
/// project → global → host roots, with first name wins).
pub fn list_agent_skills_with_injection(
    runtime: &str,
    project_root: Option<&Path>,
    injection: &SkillInjectionConfig,
) -> Vec<SkillSnapshot> {
    let Some(descriptor) = agent_descriptor(runtime) else {
        // Still surface host-injected skills when the runtime is unknown —
        // Stage 4 host control should not require a registered descriptor.
        return list_injection_skills(injection);
    };

    let mut skills = Vec::new();
    let mut seen_names = HashSet::new();
    if let Some(root) = project_root {
        collect_skills_from_dirs(
            &descriptor.project_skill_read_paths(root),
            SkillScopeSnapshot::Repo,
            &mut skills,
            &mut seen_names,
        );
    }
    collect_skills_from_dirs(
        &descriptor.global_skill_read_paths(),
        SkillScopeSnapshot::User,
        &mut skills,
        &mut seen_names,
    );
    collect_skills_from_dirs(
        &injection.roots,
        SkillScopeSnapshot::System,
        &mut skills,
        &mut seen_names,
    );

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills
}

fn list_injection_skills(injection: &SkillInjectionConfig) -> Vec<SkillSnapshot> {
    let mut skills = Vec::new();
    let mut seen_names = HashSet::new();
    collect_skills_from_dirs(
        &injection.roots,
        SkillScopeSnapshot::System,
        &mut skills,
        &mut seen_names,
    );
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills
}

/// Result of materializing host skills into runtime skill directories.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SkillMaterializeReport {
    /// Skill names successfully linked/copied into at least one runtime root.
    pub materialized: Vec<String>,
    /// Skill names from `ensure` that were not found under injection roots.
    pub missing: Vec<String>,
    /// Paths written (symlink or directory target).
    pub targets: Vec<PathBuf>,
}

/// Materialize ensured host skills into runtime global skill directories.
///
/// When `injection.materialize_into_runtime_roots` is false, this is a no-op
/// that only reports missing names. When true, each name in `ensure` is
/// resolved under `injection.roots` and linked into every `runtime_global_dirs`
/// entry (symlink when possible, recursive copy as fallback).
///
/// This is the Stage 3 primary skill-injection path for shell agents: the host
/// writes packages agents already know how to load. Call before session start,
/// then refresh skills / re-list via [`list_agent_skills_with_injection`].
pub fn materialize_skill_injection(
    injection: &SkillInjectionConfig,
    runtime_global_dirs: &[PathBuf],
) -> io::Result<SkillMaterializeReport> {
    let mut report = SkillMaterializeReport::default();
    if injection.ensure.is_empty() {
        return Ok(report);
    }

    for name in &injection.ensure {
        let Some(source) = find_skill_package_dir(&injection.roots, name) else {
            report.missing.push(name.clone());
            continue;
        };
        if !injection.materialize_into_runtime_roots {
            report.materialized.push(name.clone());
            continue;
        }
        for runtime_dir in runtime_global_dirs {
            fs::create_dir_all(runtime_dir)?;
            let target = runtime_dir.join(name);
            install_skill_package(&source, &target)?;
            report.targets.push(target);
        }
        report.materialized.push(name.clone());
    }
    Ok(report)
}

/// Resolve a skill package directory by frontmatter name or directory name.
pub fn find_skill_package_dir(roots: &[PathBuf], skill_name: &str) -> Option<PathBuf> {
    for root in roots {
        if let Some(found) = find_skill_in_dir(root, skill_name) {
            return Some(found);
        }
    }
    None
}

fn find_skill_in_dir(dir: &Path, skill_name: &str) -> Option<PathBuf> {
    let direct = dir.join(skill_name);
    if skill_dir_matches(&direct, skill_name) {
        return Some(direct);
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return None;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if skill_dir_matches(&path, skill_name) {
            return Some(path);
        }
        // Recurse for grouped layouts.
        if let Some(found) = find_skill_in_dir(&path, skill_name) {
            return Some(found);
        }
    }
    None
}

fn skill_dir_matches(dir: &Path, skill_name: &str) -> bool {
    match skill::parse_skill_dir(dir) {
        Ok(parsed) => parsed.name == skill_name,
        Err(_) => false,
    }
}

fn install_skill_package(source: &Path, target: &Path) -> io::Result<()> {
    if target.exists() || target.symlink_metadata().is_ok() {
        // Replace stale materializations so host skill updates take effect.
        if target.is_dir() && !target.is_symlink() {
            fs::remove_dir_all(target)?;
        } else {
            fs::remove_file(target).or_else(|_| fs::remove_dir_all(target))?;
        }
    }
    match symlink_dir(source, target) {
        Ok(()) => Ok(()),
        Err(_) => copy_dir_all(source, target),
    }
}

#[cfg(unix)]
fn symlink_dir(source: &Path, target: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(source, target)
}

#[cfg(not(unix))]
fn symlink_dir(source: &Path, target: &Path) -> io::Result<()> {
    // Windows junction/symlink needs elevated privileges in many environments;
    // fall through to copy via the caller.
    let _ = (source, target);
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "directory symlink not used on this platform",
    ))
}

fn copy_dir_all(source: &Path, target: &Path) -> io::Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let from = entry.path();
        let to = target.join(entry.file_name());
        if from.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Filesystem-based skill discovery from explicit JS-provided directories.
///
/// This is the extension path for JS-registered agents; it does not replace the
/// runtime descriptor path above.
pub fn list_agent_skills_from_dirs(
    global_dirs: &[PathBuf],
    project_relative_dirs: &[PathBuf],
    project_root: Option<&Path>,
) -> Vec<SkillSnapshot> {
    let mut skills = Vec::new();
    let mut seen_names = HashSet::new();
    if let Some(root) = project_root {
        let project_dirs = project_relative_dirs
            .iter()
            .map(|dir| root.join(dir))
            .collect::<Vec<_>>();
        collect_skills_from_dirs(
            &project_dirs,
            SkillScopeSnapshot::Repo,
            &mut skills,
            &mut seen_names,
        );
    }
    collect_skills_from_dirs(
        global_dirs,
        SkillScopeSnapshot::User,
        &mut skills,
        &mut seen_names,
    );

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills
}

fn agent_descriptor(runtime: &str) -> Option<&'static AgentDescriptor> {
    match runtime {
        "claude" => Some(&agents::claude::DESCRIPTOR),
        "cline" => Some(&agents::cline::DESCRIPTOR),
        "codex" => Some(&agents::codex::DESCRIPTOR),
        "copilot" => Some(&agents::copilot::DESCRIPTOR),
        "cursor" => Some(&agents::cursor::DESCRIPTOR),
        "gemini" => Some(&agents::gemini::DESCRIPTOR),
        "kimi" => Some(&agents::kimi::DESCRIPTOR),
        "opencode" => Some(&agents::opencode::DESCRIPTOR),
        "pi" => Some(&agents::pi::DESCRIPTOR),
        _ => None,
    }
}

fn collect_skills_from_dirs(
    dirs: &[PathBuf],
    scope: SkillScopeSnapshot,
    skills: &mut Vec<SkillSnapshot>,
    seen_names: &mut HashSet<String>,
) {
    for dir in dirs {
        collect_skills(dir, scope, skills, seen_names);
    }
}

fn collect_skills(
    dir: &Path,
    scope: SkillScopeSnapshot,
    skills: &mut Vec<SkillSnapshot>,
    seen_names: &mut HashSet<String>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        match skill::parse_skill_dir(&path) {
            Ok(parsed) => {
                let Some(skill_md) = skill_md_path(&path) else {
                    continue;
                };
                if !seen_names.insert(parsed.name.clone()) {
                    continue;
                }
                skills.push(SkillSnapshot {
                    name: parsed.name,
                    description: parsed.description,
                    path: skill_md.display().to_string(),
                    scope,
                    enabled: true,
                });
            }
            // Not a skill itself - recurse so grouped layouts
            // (e.g. plugin caches nesting skill dirs) are still found.
            Err(_) => collect_skills(&path, scope, skills, seen_names),
        }
    }
}

/// Resolve the SKILL.md path for a discovered skill directory, canonicalized
/// so symlinked installs match the paths runtimes report for the same skill.
fn skill_md_path(dir: &Path) -> Option<PathBuf> {
    let dir = fs::canonicalize(dir).ok()?;
    ["SKILL.md", "skill.md"]
        .into_iter()
        .map(|name| dir.join(name))
        .find(|path| path.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_skill(root: &Path, dir_name: &str, name: &str, description: &str) {
        let dir = root.join(dir_name);
        fs::create_dir_all(&dir).expect("skill dir");
        fs::write(
            dir.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: {description}\n---\nBody\n"),
        )
        .expect("skill md");
    }

    #[test]
    fn collects_skills_with_project_shadowing_global() {
        let temp = tempfile::tempdir().expect("tempdir");
        let global = temp.path().join("global");
        let project = temp.path().join("project");
        write_skill(&global, "shared", "shared-skill", "Global variant");
        write_skill(&global, "global-only", "global-only", "Global only");
        write_skill(&project, "shared", "shared-skill", "Project variant");

        let mut skills = Vec::new();
        let mut seen = HashSet::new();
        collect_skills_from_dirs(&[project], SkillScopeSnapshot::Repo, &mut skills, &mut seen);
        collect_skills_from_dirs(&[global], SkillScopeSnapshot::User, &mut skills, &mut seen);
        skills.sort_by(|a, b| a.name.cmp(&b.name));

        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "global-only");
        assert_eq!(skills[0].scope, SkillScopeSnapshot::User);
        assert_eq!(skills[1].name, "shared-skill");
        assert_eq!(skills[1].description, "Project variant");
        assert_eq!(skills[1].scope, SkillScopeSnapshot::Repo);
        assert!(skills[1].path.ends_with("SKILL.md"));
    }

    #[test]
    fn recurses_into_grouped_skill_layouts() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path().join("skills");
        write_skill(&root.join("group"), "nested", "nested-skill", "Nested");

        let mut skills = Vec::new();
        let mut seen = HashSet::new();
        collect_skills(&root, SkillScopeSnapshot::User, &mut skills, &mut seen);

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "nested-skill");
    }

    #[test]
    fn unknown_runtime_resolves_to_empty_list() {
        assert!(list_agent_skills("qoder", None).is_empty());
        assert!(list_agent_skills("not-a-runtime", None).is_empty());
    }

    #[test]
    fn pi_runtime_uses_descriptor_skill_paths() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project = temp.path().join("project");
        let skills = project.join(".pi").join("skills");
        write_skill(&skills, "repo-pi", "repo-pi", "Repo Pi skill");

        // Global skill dirs may already contain other packages on the host; only
        // assert that the project path is discovered with Repo scope.
        let skills = list_agent_skills("pi", Some(&project));
        let repo_pi = skills
            .iter()
            .find(|skill| skill.name == "repo-pi")
            .expect("repo-pi skill from project path");
        assert_eq!(repo_pi.scope, SkillScopeSnapshot::Repo);
        assert!(repo_pi.path.contains(".pi"));
    }

    #[test]
    fn collects_explicit_dirs_for_js_registered_agents() {
        let temp = tempfile::tempdir().expect("tempdir");
        let global = temp.path().join("global");
        let project_root = temp.path().join("project");
        let project_skills = project_root.join(".agent").join("skills");
        write_skill(&global, "global", "global-skill", "Global skill");
        write_skill(&project_skills, "repo", "repo-skill", "Repo skill");

        let skills = list_agent_skills_from_dirs(
            &[global],
            &[PathBuf::from(".agent/skills")],
            Some(&project_root),
        );

        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "global-skill");
        assert_eq!(skills[0].scope, SkillScopeSnapshot::User);
        assert_eq!(skills[1].name, "repo-skill");
        assert_eq!(skills[1].scope, SkillScopeSnapshot::Repo);
    }

    #[test]
    fn explicit_dirs_skip_project_relative_dirs_without_project_root() {
        let temp = tempfile::tempdir().expect("tempdir");
        let global = temp.path().join("global");
        write_skill(&global, "global", "global-skill", "Global skill");

        let skills =
            list_agent_skills_from_dirs(&[global], &[PathBuf::from(".agent/skills")], None);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "global-skill");
        assert_eq!(skills[0].scope, SkillScopeSnapshot::User);
    }

    #[test]
    fn list_with_injection_includes_host_roots_as_system_scope() {
        let temp = tempfile::tempdir().expect("tempdir");
        let host = temp.path().join("host-skills");
        write_skill(&host, "angel-host", "angel-host", "Control the host");

        let skills = list_agent_skills_with_injection(
            "not-a-runtime",
            None,
            &SkillInjectionConfig {
                roots: vec![host],
                ensure: vec!["angel-host".into()],
                materialize_into_runtime_roots: false,
            },
        );

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "angel-host");
        assert_eq!(skills[0].scope, SkillScopeSnapshot::System);
    }

    #[test]
    fn materialize_symlinks_ensured_skills_into_runtime_roots() {
        let temp = tempfile::tempdir().expect("tempdir");
        let host = temp.path().join("host-skills");
        let runtime = temp.path().join("runtime-skills");
        write_skill(&host, "angel-host", "angel-host", "Control the host");

        let report = materialize_skill_injection(
            &SkillInjectionConfig {
                roots: vec![host.clone()],
                ensure: vec!["angel-host".into(), "missing-skill".into()],
                materialize_into_runtime_roots: true,
            },
            &[runtime.clone()],
        )
        .expect("materialize");

        assert_eq!(report.materialized, vec!["angel-host".to_string()]);
        assert_eq!(report.missing, vec!["missing-skill".to_string()]);
        assert!(runtime.join("angel-host").join("SKILL.md").is_file());

        // Re-list from runtime dir via explicit dirs path.
        let listed = list_agent_skills_from_dirs(&[runtime], &[], None);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "angel-host");
    }

    #[test]
    fn materialize_without_flag_only_validates_ensure_list() {
        let temp = tempfile::tempdir().expect("tempdir");
        let host = temp.path().join("host-skills");
        let runtime = temp.path().join("runtime-skills");
        write_skill(&host, "angel-host", "angel-host", "Control the host");

        let report = materialize_skill_injection(
            &SkillInjectionConfig {
                roots: vec![host],
                ensure: vec!["angel-host".into()],
                materialize_into_runtime_roots: false,
            },
            &[runtime.clone()],
        )
        .expect("materialize");

        assert_eq!(report.materialized, vec!["angel-host".to_string()]);
        assert!(report.targets.is_empty());
        assert!(!runtime.exists());
    }
}
