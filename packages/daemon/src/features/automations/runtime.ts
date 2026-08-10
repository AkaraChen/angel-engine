import type {
  Automation,
  AutomationTrigger,
} from "@angel-engine/daemon-api/automations";
import type {
  Chat,
  ChatRunStartInput,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";
import type { AutomationRow } from "../../db/schema";

import { nextCronRun } from "./cron";
import { DaemonError } from "../../platform/errors";

const DEFAULT_TICK_MS = 15_000;
const DEFAULT_MISSED_AFTER_MS = 60_000;

interface AutomationRuntimeOptions {
  attachRunChat: (runId: string, chatId: string) => Promise<void>;
  createChat: (automation: AutomationRow) => Promise<Chat>;
  createRun: (input: {
    automationId: string;
    scheduledFor?: string | null;
    startedAt?: string;
    status?: "missed";
    trigger: AutomationTrigger;
  }) => Promise<{ id: string }>;
  finishRun: (
    runId: string,
    status: "cancelled" | "failed" | "succeeded",
    error?: string,
  ) => Promise<string | null>;
  getAutomation: (id: string) => Promise<Automation>;
  getRecord: (id: string) => Promise<AutomationRow>;
  hasActiveRun: (automationId: string) => Promise<boolean>;
  listDue: (now: string) => Promise<AutomationRow[]>;
  now?: () => Date;
  onChanged: (automationIds: string[]) => void;
  setNextRun: (id: string, nextRunAt: string | null) => Promise<void>;
  startChatRun: (runId: string, input: ChatRunStartInput) => Promise<void>;
  stopChatRun: (runId: string) => Promise<void>;
}

export class AutomationRuntime {
  readonly #options: AutomationRuntimeOptions;
  readonly #starting = new Set<string>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #ticking = false;

  constructor(options: AutomationRuntimeOptions) {
    this.#options = options;
  }

  start(intervalMs = DEFAULT_TICK_MS): void {
    if (this.#timer !== undefined) return;
    this.#timer = setInterval(
      () => void this.tick().catch(() => undefined),
      intervalMs,
    );
    this.#timer.unref?.();
    void this.tick().catch(() => undefined);
  }

  stop(): void {
    if (this.#timer === undefined) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async tick(): Promise<void> {
    if (this.#ticking) return;
    this.#ticking = true;
    try {
      const now = this.#now();
      const due = await this.#options.listDue(now.toISOString());
      for (const automation of due) {
        await this.#processDue(automation, now);
      }
    } finally {
      this.#ticking = false;
    }
  }

  async runNow(automationId: string): Promise<Automation> {
    if (this.#starting.has(automationId))
      throw DaemonError.automationRunConflict();
    this.#starting.add(automationId);
    try {
      if (await this.#options.hasActiveRun(automationId))
        throw DaemonError.automationRunConflict();
      const automation = await this.#options.getRecord(automationId);
      await this.#dispatch(automation, "manual", null);
    } finally {
      this.#starting.delete(automationId);
    }
    return this.#options.getAutomation(automationId);
  }

  async cancelActiveRuns(automationId: string): Promise<void> {
    // The automation run id is also the chat-run id. The caller supplies a
    // concrete id only while deleting through the API; terminal updates are
    // otherwise driven by `handleChatRunEvent`.
    const automation = await this.#options.getAutomation(automationId);
    const active = automation.runs.filter((run) => run.status === "running");
    for (const run of active) {
      await this.#options.stopChatRun(run.id).catch(() => undefined);
      await this.#options.finishRun(run.id, "cancelled");
    }
  }

  async handleChatRunEvent(
    runId: string,
    event: ChatStreamEvent,
  ): Promise<void> {
    if (event.type !== "result" && event.type !== "error") return;
    const automationId = await this.#options.finishRun(
      runId,
      event.type === "result" ? "succeeded" : "failed",
      event.type === "error" ? event.message : undefined,
    );
    // Most chat runs are interactive and have no automation row.
    if (automationId !== null) this.#options.onChanged([automationId]);
  }

  async #processDue(automation: AutomationRow, now: Date): Promise<void> {
    const scheduledFor = automation.nextRunAt;
    const next = nextCronRun(automation.cron, now)?.toISOString() ?? null;
    await this.#options.setNextRun(automation.id, next);

    if (
      scheduledFor === null ||
      now.getTime() - new Date(scheduledFor).getTime() >
        DEFAULT_MISSED_AFTER_MS ||
      this.#starting.has(automation.id)
    ) {
      await this.#options.createRun({
        automationId: automation.id,
        scheduledFor,
        startedAt: scheduledFor ?? now.toISOString(),
        status: "missed",
        trigger: "scheduled",
      });
      this.#options.onChanged([automation.id]);
      return;
    }
    this.#starting.add(automation.id);
    try {
      if (await this.#options.hasActiveRun(automation.id)) {
        await this.#options.createRun({
          automationId: automation.id,
          scheduledFor,
          startedAt: scheduledFor,
          status: "missed",
          trigger: "scheduled",
        });
        this.#options.onChanged([automation.id]);
        return;
      }
      await this.#dispatch(automation, "scheduled", scheduledFor);
    } finally {
      this.#starting.delete(automation.id);
    }
  }

  async #dispatch(
    automation: AutomationRow,
    trigger: AutomationTrigger,
    scheduledFor: string | null,
  ): Promise<void> {
    const run = await this.#options.createRun({
      automationId: automation.id,
      scheduledFor,
      trigger,
    });
    try {
      const chat = await this.#options.createChat(automation);
      await this.#options.attachRunChat(run.id, chat.id);
      await this.#options.startChatRun(run.id, {
        chatId: chat.id,
        text: automation.prompt,
      });
    } catch (cause) {
      await this.#options.finishRun(
        run.id,
        "failed",
        cause instanceof Error ? cause.message : String(cause),
      );
    }
    this.#options.onChanged([automation.id]);
  }

  #now(): Date {
    return this.#options.now?.() ?? new Date();
  }
}
