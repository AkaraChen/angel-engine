import { createRequire } from "node:module";

import type {
  AdapterDecodeInput,
  AdapterEncodeInput,
  TransportOutput,
} from "@angel-engine/client-napi";

import { contextPatch, contextUpdated } from "./context";
import type { JsonObject } from "./types";
import {
  additionalDirectoriesFromFields,
  asMutableObject,
  asObject,
  asRecord,
  stringField,
} from "./utils";

type AngelClientModule = typeof import("@angel-engine/client-napi");

const nodeRequire = createRequire(__filename);
const { AcpAdapter } = nodeRequire(
  "@angel-engine/client-napi",
) as AngelClientModule;

export class ClaudeCodeEngineAdapter {
  private readonly base = new AcpAdapter({ needAuthentication: false });

  protocolFlavor(): "acp" {
    return "acp";
  }

  capabilities(): unknown {
    const capabilities = structuredClone(
      this.base.capabilities(),
    ) as JsonObject;
    const lifecycle = asMutableObject(capabilities.lifecycle);
    lifecycle.load = "Supported";
    lifecycle.resume = "Supported";
    lifecycle.close = "Supported";
    const context = asMutableObject(capabilities.context);
    context.additional_directories = "Supported";
    context.config = "Supported";
    context.mode = "Supported";
    context.turn_overrides = "Supported";
    const history = asMutableObject(capabilities.history);
    history.hydrate = "Supported";
    return capabilities;
  }

  encodeEffect(input: AdapterEncodeInput): TransportOutput {
    const effect = asObject(input.effect);
    const method = String(effect?.method ?? "");
    const requestId = effect?.requestId;
    const conversationId = String(effect?.conversationId ?? "");
    const fields = asRecord(asObject(effect?.payload)?.fields);
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

    if (method === "session/new" || method === "session/resume") {
      const remoteConversationId = stringField(fields, "remoteConversationId");
      return {
        completedRequests,
        events: [
          {
            ConversationReady: {
              capabilities: null,
              context: contextPatch([
                {
                  Cwd: {
                    cwd: stringField(fields, "cwd"),
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
      const mode = stringField(fields, "modeId");
      return {
        completedRequests,
        events: mode
          ? [
              contextUpdated(conversationId, [
                { Mode: { mode: { id: mode }, scope: "TurnAndFuture" } },
              ]),
            ]
          : [],
      };
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
    const message = asObject(input.message);
    if (message?.method !== "claude/event") return {};
    const params = asObject(message.params);
    const events = Array.isArray(params?.events) ? params.events : [];
    return { events };
  }

  modelCatalogFromRuntimeDebug(): null {
    return null;
  }
}
