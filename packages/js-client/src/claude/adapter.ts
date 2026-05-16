import type {
  AdapterDecodeInput,
  AdapterEncodeInput,
  TransportOutput,
} from "@angel-engine/client-napi";
import { AcpAdapter, ClientProtocol } from "@angel-engine/client-napi";
import { contextPatch, contextUpdated } from "./context.js";
import type { ClaudeJsonObject } from "./types.js";

export class ClaudeCodeEngineAdapter {
  private readonly base = new AcpAdapter({ needAuthentication: false });

  protocolFlavor(): `${ClientProtocol}` {
    return ClientProtocol.Custom;
  }

  capabilities(): unknown {
    const capabilities = structuredClone(
      this.base.capabilities(),
    ) as ClaudeJsonObject;
    const lifecycle = asMutableObject(capabilities.lifecycle);
    lifecycle.load = "Supported";
    lifecycle.resume = "Supported";
    lifecycle.close = "Supported";
    const context = asMutableObject(capabilities.context);
    context.additional_directories = "Supported";
    context.config = "Supported";
    context.mode = "Unsupported";
    context.turn_overrides = "Supported";
    const history = asMutableObject(capabilities.history);
    history.hydrate = "Supported";
    return capabilities;
  }

  encodeEffect(input: AdapterEncodeInput): TransportOutput {
    const effect = input.effect as ClaudeJsonObject;
    if (typeof effect.method !== "string") {
      throw new Error("Claude adapter effect is missing method.");
    }
    const method = effect.method;
    const requestId = effect?.requestId;
    const completedRequests = requestId === undefined ? [] : [requestId];

    if (method === "initialize") {
      return {
        completedRequests,
        events: [
          {
            RuntimeNegotiated: {
              capabilities: {
                authentication: "Unsupported",
                discovery: "Unsupported",
                metadata: {},
                name: "Claude Code",
                version: null,
              },
              conversation_capabilities: null,
            },
          },
        ],
      };
    }

    if (typeof effect.conversationId !== "string") {
      throw new Error("Claude adapter effect is missing conversationId.");
    }
    const conversationId = effect.conversationId;
    const payload = effect.payload as ClaudeJsonObject;
    const fields = payload.fields as Record<string, unknown>;

    if (method === "session/new" || method === "session/resume") {
      const remoteConversationId = stringField(fields, "remoteConversationId");
      const cwd = requiredStringField(fields, "cwd");
      return {
        completedRequests,
        events: [
          {
            ConversationReady: {
              capabilities: null,
              context: contextPatch([
                {
                  Cwd: {
                    cwd,
                    scope: "Conversation",
                  },
                },
                {
                  AdditionalDirectories: {
                    directories: additionalDirectoriesFromFields(fields),
                    scope: "Conversation",
                  },
                },
              ]),
              id: conversationId,
              remote: remoteConversationId
                ? { Known: remoteConversationId }
                : { Local: conversationId },
            },
          },
        ],
      };
    }

    if (method === "session/set_mode") {
      return { completedRequests };
    }

    if (method === "session/set_model") {
      const model = stringField(fields, "modelId");
      return {
        completedRequests,
        events: model
          ? [
              contextUpdated(conversationId, [
                { Model: { model, scope: "TurnAndFuture" } },
              ]),
            ]
          : [],
      };
    }

    return { completedRequests };
  }

  decodeMessage(input: AdapterDecodeInput): TransportOutput {
    const message = input.message as ClaudeJsonObject;
    if (message?.method !== "claude/event") return {};
    const params = message.params as ClaudeJsonObject;
    if (!Array.isArray(params.events)) {
      throw new Error("Claude event message is missing events.");
    }
    const events = params.events as unknown[];
    return { events };
  }

  modelCatalogFromRuntimeDebug(): null {
    return null;
  }
}

function additionalDirectoriesFromFields(
  fields: Record<string, unknown>,
): string[] {
  const count = Number(fields.additionalDirectoryCount ?? 0);
  const directories: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const directory = stringField(fields, `additionalDirectory.${index}`);
    if (directory) directories.push(directory);
  }
  return directories;
}

function stringField(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function requiredStringField(
  value: Record<string, unknown>,
  field: string,
): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string") {
    throw new Error(`Claude adapter field is missing: ${field}`);
  }
  return fieldValue;
}

function asMutableObject(value: unknown): ClaudeJsonObject {
  return value as ClaudeJsonObject;
}
