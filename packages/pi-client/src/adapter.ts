import type {
  AdapterDecodeInput,
  AdapterEncodeInput,
  TransportOutput,
} from "@angel-engine/client-napi";
import { AcpAdapter, ClientProtocol } from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import type { ChatJsonValue } from "@angel-engine/js-client";
import { contextPatch, contextUpdated } from "./context.js";

type MutableJsonObject = { [key: string]: ChatJsonValue };

export class PiEngineAdapter {
  private readonly base = new AcpAdapter({ needAuthentication: false });

  protocolFlavor(): `${ClientProtocol}` {
    return ClientProtocol.Custom;
  }

  capabilities(): MutableJsonObject {
    const capabilities = structuredClone(this.base.capabilities());
    if (!is.plainObject(capabilities)) {
      throw new Error("Pi base capabilities must be an object.");
    }
    const mutableCapabilities = capabilities as MutableJsonObject;
    const lifecycleValue = mutableCapabilities.lifecycle;
    if (!is.plainObject(lifecycleValue)) {
      throw new Error("Pi base lifecycle capabilities must be an object.");
    }
    const lifecycle = lifecycleValue as MutableJsonObject;
    lifecycle.load = "Supported";
    lifecycle.resume = "Supported";
    lifecycle.close = "Supported";
    const contextValue = mutableCapabilities.context;
    if (!is.plainObject(contextValue)) {
      throw new Error("Pi base context capabilities must be an object.");
    }
    const context = contextValue as MutableJsonObject;
    context.additional_directories = "Supported";
    context.config = "Supported";
    context.mode = "Unsupported";
    context.turn_overrides = "Supported";
    const historyValue = mutableCapabilities.history;
    if (!is.plainObject(historyValue)) {
      throw new Error("Pi base history capabilities must be an object.");
    }
    const history = historyValue as MutableJsonObject;
    history.hydrate = "Supported";
    return mutableCapabilities;
  }

  encodeEffect(input: AdapterEncodeInput): TransportOutput {
    const effect = input.effect;
    if (!is.plainObject(effect)) {
      throw new Error("Pi adapter effect must be an object.");
    }
    if (!is.string(effect.method)) {
      throw new Error("Pi adapter effect is missing method.");
    }
    const method = effect.method;
    const requestId = effect.requestId;
    if (
      requestId !== undefined &&
      requestId !== null &&
      !is.string(requestId) &&
      !is.number(requestId)
    ) {
      throw new Error("Pi adapter requestId must be a string or number.");
    }
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
                name: "Pi Coding Agent",
                version: null,
              },
              conversation_capabilities: null,
            },
          },
        ],
        logs: [],
        messages: [],
      };
    }

    if (!is.string(effect.conversationId)) {
      throw new Error("Pi adapter effect is missing conversationId.");
    }
    const conversationId = effect.conversationId;
    if (!is.plainObject(effect.payload)) {
      throw new Error("Pi adapter payload must be an object.");
    }
    if (!is.plainObject(effect.payload.fields)) {
      throw new Error("Pi adapter payload fields must be an object.");
    }
    const fields = effect.payload.fields as MutableJsonObject;

    if (method === "session/new" || method === "session/resume") {
      const remoteConversationId = fields.remoteConversationId;
      if (
        remoteConversationId !== undefined &&
        !is.string(remoteConversationId)
      ) {
        throw new Error("Pi adapter remoteConversationId must be a string.");
      }
      const cwd = fields.cwd;
      if (!is.string(cwd)) {
        throw new Error("Pi adapter cwd must be a string.");
      }
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
        logs: [],
        messages: [],
      };
    }

    if (method === "session/set_mode") {
      return { completedRequests, events: [], logs: [], messages: [] };
    }

    if (method === "session/set_model") {
      const model = fields.modelId;
      if (model !== undefined && !is.string(model)) {
        throw new Error("Pi adapter modelId must be a string.");
      }
      return {
        completedRequests,
        events: model
          ? [
              contextUpdated(conversationId, [
                { Model: { model, scope: "TurnAndFuture" } },
              ]),
            ]
          : [],
        logs: [],
        messages: [],
      };
    }

    return { completedRequests, events: [], logs: [], messages: [] };
  }

  decodeMessage(input: AdapterDecodeInput): TransportOutput {
    if (!is.plainObject(input.message)) {
      throw new Error("Pi adapter message must be an object.");
    }
    if (input.message.method !== "pi/event") {
      return { completedRequests: [], events: [], logs: [], messages: [] };
    }
    if (!is.plainObject(input.message.params)) {
      throw new Error("Pi adapter event params must be an object.");
    }
    if (!is.array(input.message.params.events, is.plainObject)) {
      throw new Error("Pi adapter events must be objects.");
    }
    return {
      completedRequests: [],
      events: input.message.params.events,
      logs: [],
      messages: [],
    };
  }

  modelCatalogFromRuntimeDebug(): null {
    return null;
  }
}

function additionalDirectoriesFromFields(fields: MutableJsonObject): string[] {
  const countValue = fields.additionalDirectoryCount;
  if (countValue === undefined) return [];
  if (!is.string(countValue) && !is.number(countValue)) {
    throw new Error("Pi adapter additional directory count is invalid.");
  }
  const count = Number(countValue);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Pi adapter additional directory count is invalid.");
  }
  const directories: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const directory = fields[`additionalDirectory.${index}`];
    if (!is.string(directory) || directory.length === 0) {
      throw new Error(`Pi adapter additional directory is missing: ${index}`);
    }
    directories.push(directory);
  }
  return directories;
}
