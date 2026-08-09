import type { CommandDescriptor, CommandId } from "@shared/keybindings";
import { COMMAND_DESCRIPTORS, evaluateWhen } from "@shared/keybindings";
import type { ContextKeyValues } from "@shared/keybindings";

export type CommandHandler = (
  args?: unknown,
) => boolean | void | Promise<boolean | void>;

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

  async execute(
    id: CommandId,
    args: unknown | undefined,
    context: ContextKeyValues,
  ): Promise<boolean> {
    const descriptor = this.descriptors.get(id);
    if (!descriptor || descriptor.deprecatedBy) return false;
    if (descriptor.when && !evaluateWhen(descriptor.when, context)) {
      return false;
    }
    const handler = this.handlers.get(id);
    if (!handler) return false;
    const result = await handler(args);
    return result !== false;
  }
}

export const commandRegistry = new CommandRegistryImpl();
