/**
 * Live import→restore smoke for builtin agents present on this machine.
 *
 * Usage (from repo root or packages/daemon):
 *   bun packages/daemon/scripts/import-restore-smoke.mts [scratch-dir]
 *
 * Writes:
 *   {scratch}/agent-probe.txt
 *   {scratch}/import-restore-<runtime>.log
 *   {scratch}/import-matrix.md
 *
 * Drives shipped list helpers + session hydrate (not a re-implementation).
 */
import {
  ClaudeCodeSession,
  encodeClaudeProjectDir,
  listImportableClaudeSessions,
} from "@angel-engine/claude-client";
import {
  createRuntimeOptions,
  type ConversationSnapshot,
} from "@angel-engine/client-napi";
import {
  encodePiSessionDir,
  listImportablePiSessions,
} from "@angel-engine/pi-client";
import { Effect } from "effect";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import which from "which";
import { DesktopAngelSession } from "../src/features/chat/desktop-angel-session.ts";
import { mapNativeImportableResult } from "../src/features/chat/importable-sessions.ts";

const CATALOG = [
  "codex",
  "kimi",
  "opencode",
  "qoder",
  "copilot",
  "gemini",
  "cline",
  "claude",
  "pi",
] as const;

type RuntimeId = (typeof CATALOG)[number];

const COMMAND: Record<RuntimeId, string> = {
  claude: process.env.CLAUDE_CODE_PATH ?? process.env.CLAUDE_PATH ?? "claude",
  cline: "cline",
  codex: "codex",
  copilot: "copilot",
  gemini: "gemini",
  kimi: "kimi",
  opencode: "opencode",
  pi: "pi",
  qoder: "qodercli",
};

interface ProbeRow {
  path?: string;
  reason?: string;
  runtime: RuntimeId;
  status: "available" | "skip";
}

interface RuntimeResult {
  hydrateOk: boolean;
  importOk: boolean;
  listCount: number;
  notes: string;
  remoteId?: string;
  runtime: RuntimeId;
  status: "available" | "skip";
}

const scratch =
  process.argv[2] ?? path.join(os.tmpdir(), "angel-import-restore-smoke");
const cwd = process.env.ANGEL_IMPORT_CWD
  ? path.resolve(process.env.ANGEL_IMPORT_CWD)
  : process.cwd();

fs.mkdirSync(scratch, { recursive: true });

function logLine(file: string, line: string) {
  fs.appendFileSync(file, `${line}\n`, "utf8");
}

function isNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function probeRuntime(runtime: RuntimeId): ProbeRow {
  const command = COMMAND[runtime];
  const binary = which.sync(command, { nothrow: true });
  if (!binary) {
    return {
      reason: `binary not found for command "${command}"`,
      runtime,
      status: "skip",
    };
  }
  const version = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  if (version.error) {
    return {
      path: binary,
      reason: `version probe failed: ${version.error.message}`,
      runtime,
      status: "skip",
    };
  }
  // Some CLIs exit non-zero on --version but still work; only skip on missing binary.
  return { path: binary, runtime, status: "available" };
}

async function listSessions(
  runtime: RuntimeId,
  listCwd: string,
): Promise<{
  nextCursor?: string | null;
  sessions: Array<{
    cwd?: string | null;
    remoteId: string;
    title?: string | null;
    updatedAt?: string | null;
  }>;
  unsupportedReason?: string | null;
}> {
  if (runtime === "claude") {
    return {
      nextCursor: null,
      sessions: listImportableClaudeSessions(listCwd),
      unsupportedReason: null,
    };
  }
  if (runtime === "pi") {
    return {
      nextCursor: null,
      sessions: listImportablePiSessions(listCwd),
      unsupportedReason: null,
    };
  }

  const session = new DesktopAngelSession(
    createRuntimeOptions(runtime, {
      clientName: "angel-engine-import-smoke",
      clientTitle: "Angel Engine Import Smoke",
    }),
  );
  try {
    const raw = await Effect.runPromise(
      session.listImportableSessions({ cwd: listCwd }),
    );
    return mapNativeImportableResult(raw);
  } finally {
    session.close();
  }
}

async function hydrateSession(
  runtime: RuntimeId,
  listCwd: string,
  remoteId: string,
): Promise<ConversationSnapshot> {
  if (runtime === "claude") {
    const session = new ClaudeCodeSession();
    try {
      return await Effect.runPromise(
        session.hydrate({ cwd: listCwd, remoteId }),
      );
    } finally {
      session.close();
    }
  }
  if (runtime === "pi") {
    const { PiAgentSession } = await import("@angel-engine/pi-client");
    const session = new PiAgentSession();
    try {
      return await Effect.runPromise(
        session.hydrate({ cwd: listCwd, remoteId }),
      );
    } finally {
      session.close();
    }
  }

  const session = new DesktopAngelSession(
    createRuntimeOptions(runtime, {
      clientName: "angel-engine-import-smoke",
      clientTitle: "Angel Engine Import Smoke",
    }),
  );
  try {
    return await Effect.runPromise(session.hydrate({ cwd: listCwd, remoteId }));
  } finally {
    session.close();
  }
}

/**
 * Create a real Claude Code session via non-interactive CLI and return the
 * newest UUID session id under the encoded project dir for listCwd.
 */
function seedClaudeSession(listCwd: string, logFile: string): string | null {
  const binary = which.sync(COMMAND.claude, { nothrow: true });
  if (!binary) {
    logLine(logFile, "seed claude: binary missing");
    return null;
  }
  const projectDir = path.join(
    process.env.CLAUDE_CONFIG_DIR
      ? path.join(process.env.CLAUDE_CONFIG_DIR, "projects")
      : path.join(os.homedir(), ".claude", "projects"),
    encodeClaudeProjectDir(listCwd),
  );
  fs.mkdirSync(projectDir, { recursive: true });
  const before = new Set(
    fs
      .readdirSync(projectDir)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => name.replace(/\.jsonl$/i, "")),
  );

  logLine(logFile, "seed: claude -p short prompt (real session)");
  const result = spawnSync(
    binary,
    [
      "-p",
      "Reply with exactly: smoke-ok",
      "--dangerously-skip-permissions",
      "--output-format",
      "json",
    ],
    {
      cwd: listCwd,
      encoding: "utf8",
      timeout: 180_000,
    },
  );
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  logLine(logFile, `seed exit=${result.status} out=${combined.slice(0, 800)}`);

  // Prefer session_id from JSON output when present.
  const jsonId = combined.match(/"session_id"\s*:\s*"([0-9a-f-]{36})"/i);
  if (jsonId?.[1]) {
    logLine(logFile, `seed parsed claude session_id=${jsonId[1]}`);
    return jsonId[1];
  }

  const after = fs
    .readdirSync(projectDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => name.replace(/\.jsonl$/i, ""));
  const created = after.filter(
    (id) => !before.has(id) && /^[0-9a-f-]{36}$/i.test(id),
  );
  if (created.length > 0) {
    // Newest by mtime.
    created.sort((a, b) => {
      const am = fs.statSync(path.join(projectDir, `${a}.jsonl`)).mtimeMs;
      const bm = fs.statSync(path.join(projectDir, `${b}.jsonl`)).mtimeMs;
      return bm - am;
    });
    logLine(logFile, `seed found new claude session ${created[0]}`);
    return created[0] ?? null;
  }

  // Fall back to any real UUID already listed for this cwd.
  const existing = after.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (existing.length > 0) {
    logLine(logFile, `seed fallback existing claude session ${existing[0]}`);
    return existing[0] ?? null;
  }
  return null;
}

function seedPiSession(listCwd: string): string {
  const sessionDir = path.join(
    process.env.PI_HOME
      ? path.join(process.env.PI_HOME, "agent", "sessions")
      : path.join(os.homedir(), ".pi", "agent", "sessions"),
    encodePiSessionDir(listCwd),
  );
  fs.mkdirSync(sessionDir, { recursive: true });
  const id = `019fe${Date.now().toString(16).slice(-12).padStart(12, "0")}`;
  const timestamp = new Date().toISOString();
  const stamp = timestamp.replace(/[:.]/g, "-");
  const filePath = path.join(sessionDir, `${stamp}_${id}.jsonl`);
  // Minimal valid pi session (version 3) matching SessionManager format.
  const lines = [
    {
      type: "session",
      version: 3,
      id,
      timestamp,
      cwd: path.resolve(listCwd),
    },
    {
      type: "message",
      id: "msg-user-1",
      parentId: null,
      timestamp,
      message: {
        role: "user",
        content: [{ type: "text", text: "angel-engine import smoke seed" }],
        timestamp: Date.now(),
      },
    },
  ];
  fs.writeFileSync(
    filePath,
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    "utf8",
  );
  return filePath;
}

async function seedProtocolSession(
  runtime: RuntimeId,
  listCwd: string,
  logFile: string,
): Promise<string | null> {
  // One short non-interactive turn when the CLI supports it; otherwise skip seed.
  const binary = which.sync(COMMAND[runtime], { nothrow: true });
  if (!binary) return null;

  if (runtime === "codex") {
    logLine(logFile, "seed: codex exec 'Reply with: smoke-ok'");
    const result = spawnSync(
      binary,
      ["exec", "--skip-git-repo-check", "Reply with exactly: smoke-ok"],
      {
        cwd: listCwd,
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    logLine(
      logFile,
      `seed exit=${result.status} out=${combined.slice(0, 600)}`,
    );
    const match = combined.match(/session id:\s*([0-9a-f-]{20,})/i);
    if (match?.[1]) {
      logLine(logFile, `seed parsed session id=${match[1]}`);
      return match[1];
    }
    return null;
  }

  if (runtime === "opencode") {
    logLine(logFile, "seed: opencode run short prompt");
    const result = spawnSync(binary, ["run", "Reply with exactly: smoke-ok"], {
      cwd: listCwd,
      encoding: "utf8",
      timeout: 120_000,
    });
    logLine(
      logFile,
      `seed exit=${result.status} out=${(result.stdout ?? "").slice(0, 200)}`,
    );
    return null;
  }

  if (runtime === "kimi") {
    logLine(logFile, "seed: kimi --print short prompt");
    const result = spawnSync(
      binary,
      ["--print", "Reply with exactly: smoke-ok"],
      {
        cwd: listCwd,
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    logLine(
      logFile,
      `seed exit=${result.status} err=${(result.stderr ?? "").slice(0, 300)}`,
    );
    return null;
  }

  if (runtime === "qoder") {
    logLine(logFile, "seed: qodercli -p short prompt -w cwd");
    const result = spawnSync(
      binary,
      [
        "-p",
        "Reply with exactly: smoke-ok",
        "-w",
        listCwd,
        "--dangerously-skip-permissions",
      ],
      {
        cwd: listCwd,
        encoding: "utf8",
        timeout: 180_000,
      },
    );
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    logLine(
      logFile,
      `seed exit=${result.status} out=${combined.slice(0, 800)}`,
    );
    const match =
      combined.match(/session[_ ]id[:\s]+([0-9a-zA-Z_-]{8,})/i) ??
      combined.match(/"sessionId"\s*:\s*"([^"]+)"/i) ??
      combined.match(/"session_id"\s*:\s*"([^"]+)"/i);
    if (match?.[1]) {
      logLine(logFile, `seed parsed qoder session id=${match[1]}`);
      return match[1];
    }
    return null;
  }

  logLine(logFile, "seed: no create helper for this runtime");
  return null;
}

async function runRuntime(
  runtime: RuntimeId,
  probe: ProbeRow,
): Promise<RuntimeResult> {
  const logFile = path.join(scratch, `import-restore-${runtime}.log`);
  fs.writeFileSync(logFile, "", "utf8");
  logLine(logFile, `runtime=${runtime}`);
  logLine(logFile, `cwd=${cwd}`);
  logLine(logFile, `probe=${JSON.stringify(probe)}`);

  if (probe.status === "skip") {
    logLine(logFile, `SKIP: ${probe.reason}`);
    return {
      hydrateOk: false,
      importOk: false,
      listCount: 0,
      notes: probe.reason ?? "skipped",
      runtime,
      status: "skip",
    };
  }

  try {
    let listed = await listSessions(runtime, cwd);
    logLine(
      logFile,
      `list: count=${listed.sessions.length} unsupported=${listed.unsupportedReason ?? "null"}`,
    );
    for (const session of listed.sessions.slice(0, 5)) {
      logLine(
        logFile,
        `list item remoteId=${session.remoteId} title=${session.title ?? ""}`,
      );
    }

    let seededRemoteId: string | null = null;
    // Prefer real UUID Claude sessions over hand-written smoke stubs.
    if (runtime === "claude") {
      const uuidSessions = listed.sessions.filter((session) =>
        /^[0-9a-f-]{36}$/i.test(session.remoteId),
      );
      if (uuidSessions.length === 0) {
        logLine(
          logFile,
          "claude: no real UUID sessions — seeding via claude -p",
        );
        seededRemoteId = seedClaudeSession(cwd, logFile);
        listed = await listSessions(runtime, cwd);
        logLine(logFile, `re-list: count=${listed.sessions.length}`);
        const uuids = listed.sessions.filter((session) =>
          /^[0-9a-f-]{36}$/i.test(session.remoteId),
        );
        if (uuids.length > 0) {
          listed = { ...listed, sessions: uuids };
        } else if (isNonEmpty(seededRemoteId)) {
          listed = {
            nextCursor: null,
            sessions: [
              {
                cwd,
                remoteId: seededRemoteId,
                title: "seeded claude session",
                updatedAt: null,
              },
            ],
            unsupportedReason: null,
          };
          logLine(logFile, `using seed remoteId for import: ${seededRemoteId}`);
        }
      } else {
        listed = { ...listed, sessions: uuidSessions };
        logLine(
          logFile,
          `claude: preferring ${uuidSessions.length} real UUID session(s)`,
        );
      }
    } else if (listed.sessions.length === 0 && !listed.unsupportedReason) {
      logLine(logFile, "list empty — attempting seed session");
      if (runtime === "pi") {
        seededRemoteId = seedPiSession(cwd);
        logLine(logFile, `seeded pi remoteId=${seededRemoteId}`);
      } else {
        seededRemoteId = await seedProtocolSession(runtime, cwd, logFile);
      }
      listed = await listSessions(runtime, cwd);
      logLine(logFile, `re-list: count=${listed.sessions.length}`);
      // Protocol list may lag a brand-new session; use seed-parsed remote id.
      if (listed.sessions.length === 0 && isNonEmpty(seededRemoteId)) {
        listed = {
          nextCursor: null,
          sessions: [
            {
              cwd,
              remoteId: seededRemoteId,
              title: `seeded ${runtime} session`,
              updatedAt: null,
            },
          ],
          unsupportedReason: null,
        };
        logLine(logFile, `using seed remoteId for import: ${seededRemoteId}`);
      }
    }

    if (listed.unsupportedReason) {
      logLine(
        logFile,
        `RESULT: list unsupported — ${listed.unsupportedReason}`,
      );
      return {
        hydrateOk: false,
        importOk: false,
        listCount: 0,
        notes: `unsupported: ${listed.unsupportedReason}`,
        runtime,
        status: "available",
      };
    }

    if (listed.sessions.length === 0 && isNonEmpty(seededRemoteId)) {
      listed = {
        nextCursor: null,
        sessions: [
          {
            cwd,
            remoteId: seededRemoteId,
            title: "seeded session",
            updatedAt: null,
          },
        ],
        unsupportedReason: null,
      };
      logLine(logFile, `using seed remoteId for import: ${seededRemoteId}`);
    }

    if (listed.sessions.length === 0) {
      logLine(logFile, "RESULT: list empty after seed; cannot import");
      return {
        hydrateOk: false,
        importOk: false,
        listCount: 0,
        notes: "list empty after seed",
        runtime,
        status: "available",
      };
    }

    const pick = listed.sessions[0]!;
    if (!pick.remoteId.trim()) {
      logLine(logFile, "RESULT: empty remote id (invalid)");
      return {
        hydrateOk: false,
        importOk: false,
        listCount: listed.sessions.length,
        notes: "empty remote id",
        runtime,
        status: "available",
      };
    }

    logLine(logFile, `import/open: hydrate remoteId=${pick.remoteId}`);
    // Binding observation: remote id from list is the identity we would persist
    // as chat.remoteThreadId; hydrate is the open/restore step.
    const boundRemoteId = pick.remoteId;
    logLine(logFile, `bound remoteThreadId=${boundRemoteId}`);

    try {
      const snapshot = await hydrateSession(runtime, cwd, boundRemoteId);
      const snapRemote = snapshot.remoteId ?? null;
      const messageCount = snapshot.messages?.length ?? 0;
      const historyTurns = snapshot.history?.turnCount ?? 0;
      const historyReplay = snapshot.history?.replay?.length ?? 0;
      logLine(
        logFile,
        `hydrate response lifecycle=${snapshot.lifecycle} remoteId=${snapRemote} messages=${messageCount} historyTurns=${historyTurns} historyReplay=${historyReplay}`,
      );
      const importOk = boundRemoteId.length > 0;
      // Empty snapshot after hydrate is not success — real restore must surface
      // content, or we treat it as a typed empty-restore failure.
      const restoredContent =
        messageCount > 0 || historyTurns > 0 || historyReplay > 0;
      if (!restoredContent) {
        logLine(
          logFile,
          "hydrate typed failure: restored snapshot has no messages/history",
        );
        return {
          hydrateOk: false,
          importOk,
          listCount: listed.sessions.length,
          notes: `hydrate empty restore messages=0 snapRemote=${snapRemote ?? "null"}`,
          remoteId: boundRemoteId,
          runtime,
          status: "available",
        };
      }
      logLine(logFile, "hydrate ok with restored content");
      return {
        hydrateOk: true,
        importOk,
        listCount: listed.sessions.length,
        notes: `messages=${messageCount} snapRemote=${snapRemote ?? "null"}`,
        remoteId: boundRemoteId,
        runtime,
        status: "available",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logLine(logFile, `hydrate typed failure: ${message}`);
      // List+bind still succeeded; open failure is a real typed path result.
      return {
        hydrateOk: false,
        importOk: true,
        listCount: listed.sessions.length,
        notes: `hydrate failed: ${message}`,
        remoteId: boundRemoteId,
        runtime,
        status: "available",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logLine(logFile, `RESULT: error ${message}`);
    return {
      hydrateOk: false,
      importOk: false,
      listCount: 0,
      notes: message,
      runtime,
      status: "available",
    };
  }
}

async function main() {
  const probes: ProbeRow[] = CATALOG.map(probeRuntime);
  const probePath = path.join(scratch, "agent-probe.txt");
  fs.writeFileSync(
    probePath,
    probes
      .map((row) =>
        row.status === "available"
          ? `${row.runtime} | available | ${row.path}`
          : `${row.runtime} | skip | ${row.reason}`,
      )
      .join("\n") + "\n",
    "utf8",
  );
  console.log(`wrote ${probePath}`);

  const results: RuntimeResult[] = [];
  for (const probe of probes) {
    console.log(`→ ${probe.runtime} (${probe.status})`);
    const result = await runRuntime(probe.runtime, probe);
    results.push(result);
    console.log(
      `  list=${result.listCount} importOk=${result.importOk} hydrateOk=${result.hydrateOk} ${result.notes}`,
    );
  }

  const matrixPath = path.join(scratch, "import-matrix.md");
  const lines = [
    "# Import restore matrix",
    "",
    `| runtime | available | list count | import/bind | hydrate | notes |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...results.map((row) => {
      if (row.status === "skip") {
        return `| ${row.runtime} | skip | — | — | — | ${row.notes.replace(/\|/g, "/")} |`;
      }
      return `| ${row.runtime} | yes | ${row.listCount} | ${row.importOk ? "ok" : "fail"} | ${row.hydrateOk ? "ok" : "fail/typed"} | ${row.notes.replace(/\|/g, "/")} |`;
    }),
    "",
    `cwd: \`${cwd}\``,
    `scratch: \`${scratch}\``,
  ];
  fs.writeFileSync(matrixPath, lines.join("\n") + "\n", "utf8");
  console.log(`wrote ${matrixPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
