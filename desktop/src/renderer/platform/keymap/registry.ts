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
  /** LIFO stack per command — nested register/unregister restores the previous. */
  private readonly handlerStacks = new Map<CommandId, CommandHandler[]>();

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
    const stack = this.handlerStacks.get(id) ?? [];
    stack.push(handler);
    this.handlerStacks.set(id, stack);
    return () => {
      const current = this.handlerStacks.get(id);
      if (!current) return;
      const index = current.lastIndexOf(handler);
      if (index < 0) return;
      current.splice(index, 1);
      if (current.length === 0) {
        this.handlerStacks.delete(id);
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
    const stack = this.handlerStacks.get(id);
    return Boolean(stack && stack.length > 0);
  }

  /** Top of stack (most recently registered), if any. */
  topHandler(id: CommandId): CommandHandler | undefined {
    const stack = this.handlerStacks.get(id);
    if (!stack || stack.length === 0) return undefined;
    return stack[stack.length - 1];
  }

  /**
   * Synchronous availability check (when + at least one handler) without running handlers.
   */
  isExecutable(id: CommandId, context: ContextKeyValues): boolean {
    const descriptor = this.descriptors.get(id);
    if (!descriptor || descriptor.deprecatedBy) return false;
    if (descriptor.when && !evaluateWhen(descriptor.when, context)) {
      return false;
    }
    return this.hasHandler(id);
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
   * Run handlers from the top of the stack downward (KIT-796 E4).
   * Sync `false` declines that layer and tries the previous registration.
   */
  tryExecute(
    id: CommandId,
    args: unknown,
    context: ContextKeyValues,
  ): ExecuteOutcome {
    const descriptor = this.descriptors.get(id);
    if (!descriptor || descriptor.deprecatedBy) return "missing";
    if (descriptor.when && !evaluateWhen(descriptor.when, context)) {
      return "missing";
    }

    const stack = this.handlerStacks.get(id);
    if (!stack || stack.length === 0) return "missing";

    // Newest first.
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const handler = stack[i]!;
      const outcome = runHandler(id, handler, args);
      if (outcome === "accepted") return "accepted";
      // declined → try older handler
    }
    return "declined";
  }
}

function runHandler(
  id: CommandId,
  handler: CommandHandler,
  args: unknown,
): "accepted" | "declined" {
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

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then: unknown }).then === "function"
  );
}

export const commandRegistry = new CommandRegistryImpl();
