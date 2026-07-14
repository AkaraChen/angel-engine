import type {
  AgentOption,
  AgentSkillDirectoryRules,
  BuiltinAgentRuntime,
} from "./agents";

export const AGENT_SKILL_DIRECTORY_RULES: Partial<
  Record<BuiltinAgentRuntime, AgentSkillDirectoryRules>
> = {
  claude: {
    globalDirs: ["~/.claude/skills"],
    projectRelativeDirs: [".claude/skills"],
  },
  cline: {
    globalDirs: ["~/.agents/skills"],
    projectRelativeDirs: [".agents/skills"],
  },
  codex: {
    globalDirs: ["~/.codex/skills", "~/.agents/skills", "/etc/codex/skills"],
    projectRelativeDirs: [".agents/skills"],
  },
  copilot: {
    globalDirs: ["~/.copilot/skills"],
    projectRelativeDirs: [".agents/skills"],
  },
  gemini: {
    globalDirs: ["~/.gemini/skills"],
    projectRelativeDirs: [".agents/skills"],
  },
  kimi: {
    globalDirs: ["~/.config/agents/skills"],
    projectRelativeDirs: [".agents/skills"],
  },
  opencode: {
    globalDirs: [
      "~/.config/opencode/skills",
      "~/.claude/skills",
      "~/.agents/skills",
    ],
    projectRelativeDirs: [
      ".opencode/skills",
      ".claude/skills",
      ".agents/skills",
    ],
  },
  pi: {
    globalDirs: ["~/.pi/agent/skills", "~/.agents/skills"],
    projectRelativeDirs: [".pi/skills", ".agents/skills"],
  },
};

export const AGENT_OPTIONS: AgentOption[] = [
  {
    description: "Kimi runtime for Moonshot-based coding sessions.",
    id: "kimi",
    label: "Kimi",
    skillDirectories: AGENT_SKILL_DIRECTORY_RULES.kimi,
  },
  {
    description: "OpenCode runtime for local OpenCode agent sessions.",
    id: "opencode",
    label: "OpenCode",
    skillDirectories: AGENT_SKILL_DIRECTORY_RULES.opencode,
  },
  {
    description: "Qoder CLI through its ACP server.",
    id: "qoder",
    label: "Qoder",
  },
  {
    description: "GitHub Copilot CLI through its ACP server.",
    id: "copilot",
    label: "GitHub Copilot",
    skillDirectories: AGENT_SKILL_DIRECTORY_RULES.copilot,
  },
  {
    description: "Gemini CLI through its ACP server.",
    id: "gemini",
    label: "Gemini",
    skillDirectories: AGENT_SKILL_DIRECTORY_RULES.gemini,
  },
  {
    description: "Cline CLI through its ACP server.",
    id: "cline",
    label: "Cline",
    skillDirectories: AGENT_SKILL_DIRECTORY_RULES.cline,
  },
  {
    description: "Claude Code runtime through the Claude Agent SDK.",
    id: "claude",
    label: "Claude Code",
    skillDirectories: AGENT_SKILL_DIRECTORY_RULES.claude,
  },
  {
    description: "Pi Coding Agent runtime through the Pi SDK.",
    id: "pi",
    label: "Pi",
    skillDirectories: AGENT_SKILL_DIRECTORY_RULES.pi,
  },
  {
    description: "Codex runtime through the Codex app server.",
    id: "codex",
    label: "Codex",
    skillDirectories: AGENT_SKILL_DIRECTORY_RULES.codex,
  },
];
