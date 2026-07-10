import type {
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";

import type {
  ActiveClaudeTurn,
  ClaudeElicitationResponse,
  EngineEventJson,
  PendingPermission,
} from "./types.js";
import type { TurnRunEvent } from "@angel-engine/client-napi";
import {
  EngineEventElicitationKind,
  EngineEventElicitationPhase,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import {
  claudeElicitationBody,
  claudeElicitationChoices,
  claudeElicitationKind,
  claudeElicitationQuestions,
  updatedInputFromElicitationResponse,
} from "./elicitation.js";
import { actionObserved } from "./events.js";
import type { ClaudeToolInput } from "./sdk-types.js";
import { toolInputSummary } from "./tooling.js";
import { permissionDecision } from "./utils.js";

type EmitEngineEvents = (
  events: EngineEventJson[],
  onEvent?: (event: TurnRunEvent) => void,
) => void;

export class ClaudeSessionPermissions {
  private readonly pendingPermissions = new Map<string, PendingPermission>();

  close(): void {
    for (const pending of this.pendingPermissions.values()) {
      pending.reject(new Error("Chat session closed."));
    }
    this.pendingPermissions.clear();
  }

  canUseTool(
    active: ActiveClaudeTurn,
    emitEngineEvents: EmitEngineEvents,
  ): CanUseTool {
    return async (toolName, input, context) => {
      const toolInput: ClaudeToolInput = input;
      if (!is.nonEmptyString(context.toolUseID)) {
        throw new Error("Claude tool permission context is missing toolUseID.");
      }
      const actionId = context.toolUseID;
      const pending = this.createPendingPermission(actionId);
      const inputSummary = toolInputSummary(toolName, toolInput);
      const elicitationKind = claudeElicitationKind(toolName, toolInput);
      const events = [
        actionObserved(active, actionId, toolName, toolInput),
        {
          ElicitationOpened: {
            conversation_id: active.conversationId,
            elicitation: {
              action_id: actionId,
              id: actionId,
              kind: elicitationKind,
              options: {
                body: claudeElicitationBody(
                  toolName,
                  toolInput,
                  context,
                  inputSummary,
                ),
                choices: claudeElicitationChoices(toolName, toolInput),
                questions: claudeElicitationQuestions(toolName, toolInput),
                title:
                  context.title ??
                  context.displayName ??
                  (elicitationKind === EngineEventElicitationKind.UserInput
                    ? "Question"
                    : `Allow ${toolName}?`),
              },
              phase: EngineEventElicitationPhase.Open,
              remote_request_id: { Local: actionId },
              turn_id: active.turnId,
            },
          },
        },
      ];
      emitEngineEvents(events, active.request.onEvent);

      const response = await pending.promise;
      const decision = permissionDecision(response);
      emitEngineEvents(
        [
          {
            ElicitationResolved: {
              conversation_id: active.conversationId,
              decision,
              elicitation_id: actionId,
            },
          },
        ],
        active.request.onEvent,
      );
      if (response.type === "allow" || response.type === "allowForSession") {
        return {
          behavior: "allow",
          decisionClassification:
            response.type === "allowForSession"
              ? "user_permanent"
              : "user_temporary",
          toolUseID: actionId,
          updatedInput: input,
          updatedPermissions:
            response.type === "allowForSession"
              ? context.suggestions
              : undefined,
        } satisfies PermissionResult;
      }
      if (response.type === "answers") {
        return {
          behavior: "allow",
          toolUseID: actionId,
          updatedInput: updatedInputFromElicitationResponse(
            toolName,
            toolInput,
            response,
          ),
        } satisfies PermissionResult;
      }
      return {
        behavior: "deny",
        decisionClassification: "user_reject",
        interrupt: response.type === "cancel",
        message:
          response.type === "cancel" ? "Cancelled by user." : "Denied by user.",
        toolUseID: actionId,
      } satisfies PermissionResult;
    };
  }

  resolve(elicitationId: string, response: ClaudeElicitationResponse): void {
    const pending = this.pendingPermissions.get(elicitationId);
    if (!pending) {
      throw new Error("Chat stream is not waiting for this user input.");
    }
    pending.resolve(response);
  }

  private createPendingPermission(elicitationId: string): PendingPermission {
    const existing = this.pendingPermissions.get(elicitationId);
    if (existing) return existing;

    let resolve!: (response: ClaudeElicitationResponse) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<ClaudeElicitationResponse>(
      (resolvePromise, rejectPromise) => {
        resolve = (response): void => {
          this.pendingPermissions.delete(elicitationId);
          resolvePromise(response);
        };
        reject = (error): void => {
          this.pendingPermissions.delete(elicitationId);
          rejectPromise(error);
        };
      },
    );
    const pending = { promise, reject, resolve };
    this.pendingPermissions.set(elicitationId, pending);
    return pending;
  }
}
