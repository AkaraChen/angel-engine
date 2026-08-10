import {
  createDaemonClient,
  DaemonRequestError,
  type DaemonClient,
} from "@angel-engine/daemon-client";

import {
  ConnectionError,
  resolveDaemonConnection,
  type ConnectionOverrides,
} from "./connection";
import { ExitCode } from "./exit";
import { CLI_NAME, CLI_VERSION, usageText } from "./help";
import { writeError, writeResult, type OutputOptions } from "./output";

export interface ParsedCli {
  args: string[];
  command: string[];
  connection: ConnectionOverrides;
  help: boolean;
  output: OutputOptions;
  version: boolean;
}

export function parseArgv(argv: string[]): ParsedCli {
  const connection: ConnectionOverrides = {};
  const output: OutputOptions = { json: false, quiet: false };
  let help = false;
  let version = false;
  const command: string[] = [];
  const args: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) break;

    if (command.length === 0) {
      if (token === "--help" || token === "-h") {
        help = true;
        continue;
      }
      if (token === "--version" || token === "-V") {
        version = true;
        continue;
      }
      if (token === "--json") {
        output.json = true;
        continue;
      }
      if (token === "--quiet" || token === "-q") {
        output.quiet = true;
        continue;
      }
      if (token === "--url") {
        connection.url = requireValue(argv, index, "--url");
        index += 1;
        continue;
      }
      if (token.startsWith("--url=")) {
        connection.url = token.slice("--url=".length);
        continue;
      }
      if (token === "--token") {
        connection.token = requireValue(argv, index, "--token");
        index += 1;
        continue;
      }
      if (token.startsWith("--token=")) {
        connection.token = token.slice("--token=".length);
        continue;
      }
      if (token === "--info") {
        connection.infoPath = requireValue(argv, index, "--info");
        index += 1;
        continue;
      }
      if (token.startsWith("--info=")) {
        connection.infoPath = token.slice("--info=".length);
        continue;
      }
      if (token.startsWith("-") && token !== "--") {
        throw new UsageError(`Unknown option: ${token}`);
      }
    }

    if (command.length < 2) {
      command.push(token);
      continue;
    }
    args.push(token);
  }

  return { args, command, connection, help, output, version };
}

export async function runCli(
  argv: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    homeDir?: string;
    stderr?: NodeJS.WritableStream;
    stdout?: NodeJS.WritableStream;
  } = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  let parsed: ParsedCli;
  try {
    parsed = parseArgv(argv);
  } catch (error) {
    writeError(errorMessage(error), stderr);
    writeError(usageText(), stderr);
    return ExitCode.usage;
  }

  if (parsed.help || (parsed.command.length === 0 && !parsed.version)) {
    stdout.write(`${usageText()}\n`);
    return ExitCode.success;
  }

  if (parsed.version && parsed.command.length === 0) {
    writeResult({ cli: CLI_VERSION, name: CLI_NAME }, parsed.output, stdout);
    return ExitCode.success;
  }

  const [group, action] = parsed.command;
  if (group === undefined) {
    writeError("Missing command.", stderr);
    writeError(usageText(), stderr);
    return ExitCode.usage;
  }

  // Local-only commands that do not need a live daemon.
  if (group === "which") {
    try {
      const connection = resolveDaemonConnection(
        parsed.connection,
        options.env ?? process.env,
        options.homeDir,
      );
      writeResult(
        {
          binary: process.argv[1] ?? CLI_NAME,
          source: connection.source,
          token: "[redacted]",
          url: connection.url,
        },
        parsed.output,
        stdout,
      );
      return ExitCode.success;
    } catch (error) {
      return handleError(error, stderr);
    }
  }

  if (group === "version" && action === undefined) {
    // Prefer reporting daemon version when reachable; always include CLI.
    try {
      const client = createClient(parsed, options);
      const health = await client.health();
      writeResult(
        { cli: CLI_VERSION, daemon: health.version, name: CLI_NAME },
        parsed.output,
        stdout,
      );
      return ExitCode.success;
    } catch (error) {
      if (error instanceof ConnectionError) {
        writeResult(
          { cli: CLI_VERSION, daemon: null, name: CLI_NAME },
          parsed.output,
          stdout,
        );
        return ExitCode.success;
      }
      return handleError(error, stderr);
    }
  }

  let client: DaemonClient;
  try {
    client = createClient(parsed, options);
  } catch (error) {
    return handleError(error, stderr);
  }

  try {
    const result = await dispatch(client, group, action, parsed.args);
    writeResult(result, parsed.output, stdout);
    return ExitCode.success;
  } catch (error) {
    return handleError(error, stderr);
  }
}

function createClient(
  parsed: ParsedCli,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    homeDir?: string;
  },
): DaemonClient {
  const connection = resolveDaemonConnection(
    parsed.connection,
    options.env ?? process.env,
    options.homeDir,
  );
  return createDaemonClient({
    baseUrl: connection.url,
    fetch: options.fetchImpl,
    token: connection.token,
  });
}

async function dispatch(
  client: DaemonClient,
  group: string,
  action: string | undefined,
  args: string[],
): Promise<unknown> {
  switch (group) {
    case "health":
      requireNoAction(action, "health");
      return client.health();
    case "chat":
      return dispatchChat(client, action, args);
    case "run":
      return dispatchRun(client, action, args);
    case "attention":
      requireAction(action, "attention", "ls");
      if (action !== "ls")
        throw new UsageError(`Unknown attention command: ${action}`);
      return client.attention.list();
    case "activity":
      requireAction(action, "activity", "ls");
      if (action !== "ls")
        throw new UsageError(`Unknown activity command: ${action}`);
      return client.activity.list();
    case "project":
      return dispatchProject(client, action, args);
    case "worktree":
      return dispatchWorktree(client, action, args);
    case "agent":
      requireAction(action, "agent", "ls");
      if (action !== "ls")
        throw new UsageError(`Unknown agent command: ${action}`);
      return client.agents.listAvailable();
    case "skill":
      return dispatchSkill(client, action, args);
    default:
      throw new UsageError(`Unknown command: ${group}`);
  }
}

async function dispatchChat(
  client: DaemonClient,
  action: string | undefined,
  args: string[],
): Promise<unknown> {
  requireAction(action, "chat", "ls|get|create|send|archive");
  switch (action) {
    case "ls":
      return client.chats.list();
    case "get": {
      const id = requireArg(args, 0, "chat get <id>");
      const chat = await client.chats.get(id);
      if (chat === null) {
        throw new DomainError(`Chat not found: ${id}`);
      }
      return chat;
    }
    case "create": {
      const flags = parseKeyFlags(args);
      return client.chats.create({
        cwd: flags.cwd,
        projectId: flags.project,
        runtime: flags.runtime,
        title: flags.title,
      });
    }
    case "send": {
      const id = requireArg(args, 0, "chat send <id> <text...>");
      const text = args.slice(1).join(" ").trim();
      if (text.length === 0) {
        throw new UsageError("chat send requires message text.");
      }
      return client.chats.send({ chatId: id, text });
    }
    case "archive": {
      const id = requireArg(args, 0, "chat archive <id>");
      return client.chats.archive(id);
    }
    default:
      throw new UsageError(`Unknown chat command: ${action}`);
  }
}

async function dispatchRun(
  client: DaemonClient,
  action: string | undefined,
  args: string[],
): Promise<unknown> {
  requireAction(action, "run", "active|stop");
  switch (action) {
    case "active": {
      const chatId = requireArg(args, 0, "run active <chatId>");
      return client.chatRuns.active(chatId);
    }
    case "stop": {
      const runId = requireArg(args, 0, "run stop <runId>");
      return client.chatRuns.stop(runId);
    }
    default:
      throw new UsageError(`Unknown run command: ${action}`);
  }
}

async function dispatchProject(
  client: DaemonClient,
  action: string | undefined,
  args: string[],
): Promise<unknown> {
  requireAction(action, "project", "ls|get|git-status");
  switch (action) {
    case "ls":
      return client.projects.list();
    case "get": {
      const id = requireArg(args, 0, "project get <id>");
      const project = await client.projects.get(id);
      if (project === null) {
        throw new DomainError(`Project not found: ${id}`);
      }
      return project;
    }
    case "git-status": {
      const id = requireArg(args, 0, "project git-status <id>");
      return client.projects.gitStatus({ projectId: id });
    }
    default:
      throw new UsageError(`Unknown project command: ${action}`);
  }
}

async function dispatchWorktree(
  client: DaemonClient,
  action: string | undefined,
  args: string[],
): Promise<unknown> {
  requireAction(action, "worktree", "ls");
  if (action !== "ls")
    throw new UsageError(`Unknown worktree command: ${action}`);
  const flags = parseKeyFlags(args);
  return client.worktrees.listManaged({
    eligibleOnly:
      flags["eligible-only"] === "true" || args.includes("--eligible-only"),
  });
}

async function dispatchSkill(
  client: DaemonClient,
  action: string | undefined,
  args: string[],
): Promise<unknown> {
  requireAction(action, "skill", "ls");
  if (action !== "ls") throw new UsageError(`Unknown skill command: ${action}`);
  const flags = parseKeyFlags(args);
  const runtime = flags.runtime;
  if (runtime === undefined || runtime.length === 0) {
    throw new UsageError("skill ls requires --runtime <id>.");
  }
  return client.agents.listSkills({
    projectPath: flags.project,
    runtime,
  });
}

function parseKeyFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined || !token.startsWith("--")) continue;
    if (token.includes("=")) {
      const [key, ...rest] = token.slice(2).split("=");
      if (key !== undefined) flags[key] = rest.join("=");
      continue;
    }
    const key = token.slice(2);
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = "true";
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return flags;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new UsageError(`Missing value for ${flag}.`);
  }
  return value;
}

function requireArg(args: string[], index: number, usage: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0) {
    throw new UsageError(`Missing argument. Usage: ${usage}`);
  }
  return value;
}

function requireAction(
  action: string | undefined,
  group: string,
  expected: string,
): asserts action is string {
  if (action === undefined) {
    throw new UsageError(
      `Missing subcommand for ${group}. Expected: ${expected}`,
    );
  }
}

function requireNoAction(action: string | undefined, group: string): void {
  if (action !== undefined) {
    throw new UsageError(`Unexpected arguments for ${group}.`);
  }
}

function handleError(error: unknown, stderr: NodeJS.WritableStream): number {
  if (error instanceof UsageError) {
    writeError(error.message, stderr);
    return ExitCode.usage;
  }
  if (error instanceof ConnectionError) {
    writeError(error.message, stderr);
    return ExitCode.usage;
  }
  if (error instanceof DomainError) {
    writeError(error.message, stderr);
    return ExitCode.domain;
  }
  if (error instanceof DaemonRequestError) {
    writeError(error.message, stderr);
    if (error.status === 401 || error.status === 403) return ExitCode.auth;
    if (error.status === 0) return ExitCode.unreachable;
    if (error.status === 404) return ExitCode.domain;
    return ExitCode.domain;
  }
  if (
    error instanceof TypeError &&
    /fetch|network|ECONNREFUSED/i.test(error.message)
  ) {
    writeError(error.message, stderr);
    return ExitCode.unreachable;
  }
  writeError(errorMessage(error), stderr);
  return ExitCode.domain;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
