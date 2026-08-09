import type {
  CommandDescriptor,
  CommandId,
  ContextKeyValues,
} from "@shared/keybindings";
import { COMMAND_DESCRIPTORS, evaluateWhen } from "@shared/keybindings";

export type CommandHandler = (
  args?: unknown,
) => boolean | void | Promise<boolean | void>;

export type ExecuteOutcome = "accepted" | "declined" | "missing";

type Disposable = () => void;

class CommandRegistryImpl {
  private readonly descriptors = new Map<CommandId, CommandDescriptor>();
  private readonly handlers = new Map<CommandId, CommandHandler>();

  constructor() {
    for (const descriptor of COMMAND_DESCRIPTORS) {
      this.descriptors.set(descriptor.id, descriptor);
    }
  }

  describe(descriptors: readonly CommandDescriptor[]) {
    for (const descriptor of descriptors) {
      this.descriptors.set(descriptor.id, descriptor);
    }
  }

  register(id: CommandId, handler: CommandHandler): Disposable {
    this.handlers.set(id, handler);
    return () => {
      if (this.handlers.get(id) === handler) {
        this.handlers.delete(id);
      }
    };
  }

  getDescriptor(id: CommandId): CommandDescriptor | undefined {
    return this.descriptors.get(id);
  }

  listDescriptors(): CommandDescriptor[] {
    return [...this.descriptors.values()].filter(
      (descriptor) => !descriptor.hidden && !descriptor.deprecatedBy,
    );
  }

  hasHandler(id: CommandId): boolean {
    return this.handlers.has(id);
  }

  /**
   * Synchronous availability check (when + handler present) without running the handler.
   */
  isExecutable(id: CommandId, context: ContextKeyValues): boolean {
    const descriptor = this.descriptors.get(id);
    if (!descriptor || descriptor.deprecatedBy) return false;
    if (descriptor.when && !evaluateWhen(descriptor.when, context)) {
      return false;
    }
    return this.handlers.has(id);
  }

  async execute(
    id: CommandId,
    args: unknown,
    context: ContextKeyValues,
  ): Promise<boolean> {
    const outcome = this.tryExecute(id, args, context);
    return outcome === "accepted";
  }

  /**
   * Run a handler and report whether it consumed the event (KIT-796 E4).
   *
   * - Sync `false` → declined (caller may try the next rule; no preventDefault yet).
   * - Sync true/void → accepted.
   * - Async (Promise) → accepted optimistically; rejections are logged, not rethrown.
   *   Async handlers that need to decline must decide synchronously first.
   */
  tryExecute(
    id: CommandId,
    args: unknown,
    context: ContextKeyValues,
  ): ExecuteOutcome {
    if (!this.isExecutable(id, context)) return "missing";
    const handler = this.handlers.get(id);
    if (!handler) return "missing";

    try {
      const result = handler(args);
      if (isThenable(result)) {
        void Promise.resolve(result).then(
          (value) => {
            if (value === false) {
              console.warn(
                `[keymap] async handler for ${id} returned false after claim; prefer sync decline`,
              );
            }
          },
          (error: unknown) => {
            console.warn(`[keymap] handler for ${id} rejected`, error);
          },
        );
        return "accepted";
      }
      return result === false ? "declined" : "accepted";
    } catch (error: unknown) {
      console.warn(`[keymap] handler for ${id} threw`, error);
      return "declined";
    }
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then: unknown }).then === "function"
  );
}

export const commandRegistry = new CommandRegistryImpl();
