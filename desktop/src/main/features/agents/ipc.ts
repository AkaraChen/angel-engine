import type {
  AgentSkillsInput,
  CreateCustomAgentInput,
  UpdateCustomAgentInput,
} from "../../../shared/agents";
import type { ChatRuntime } from "../chat/runtime";
import { listAgentSkills } from "@angel-engine/client-napi";
import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";
import { listAvailableAgents } from "./availability";
import {
  createCustomAgent,
  customAgentDeleteImpact,
  deleteCustomAgentWithChats,
  listCustomAgents,
  updateCustomAgent,
} from "./repository";
import { agentSkillsInput } from "./schemas";

const t = tipc.create();

export function createAgentIpcRouter(chatRuntime: ChatRuntime) {
  return {
    agentsCreateCustom: t.procedure
      .input<CreateCustomAgentInput>()
      .action(async ({ input }) => createCustomAgent(input)),
    agentsCustomDeleteImpact: t.procedure
      .input<string>()
      .action(async ({ input }) => customAgentDeleteImpact(input)),
    agentsDeleteCustom: t.procedure
      .input<string>()
      .action(async ({ input }) => {
        const deletedChatIds = deleteCustomAgentWithChats(input);
        for (const chatId of deletedChatIds) {
          chatRuntime.closeChatSession(chatId);
        }
        return { deletedChatIds };
      }),
    agentsListAvailable: t.procedure.action(async () => listAvailableAgents()),
    agentsListCustom: t.procedure.action(async () => listCustomAgents()),
    agentsListSkills: t.procedure
      .input<AgentSkillsInput>()
      .action(async ({ input }) => {
        const value = agentSkillsInput(input);
        if (value instanceof arkType.errors) {
          throw new TypeError("Agent skills input is required.");
        }
        return listAgentSkills(value.runtime, value.projectPath ?? null);
      }),
    agentsUpdateCustom: t.procedure
      .input<UpdateCustomAgentInput>()
      .action(async ({ input }) => updateCustomAgent(input)),
  };
}
