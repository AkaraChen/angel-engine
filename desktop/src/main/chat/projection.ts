import type {
  ActionOutputSnapshot,
  ActionSnapshot,
  ConversationSnapshot,
  ElicitationSnapshot,
  TurnRunResult,
  TurnSnapshot,
} from '@angel-engine/client';

import type {
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatRuntimeConfig,
  ChatRuntimeConfigOption,
  ChatStreamDelta,
  ChatToolAction,
} from '../../shared/chat';
import { appendChatTextPart, chatToolActionToPart } from '../../shared/chat';

export type RawTurnStreamEvent =
  | ChatStreamDelta
  | { action: ActionSnapshot; type: 'actionObserved' }
  | { action: ActionSnapshot; type: 'actionUpdated' }
  | {
      actionId: string;
      content: ActionOutputSnapshot;
      turnId: string;
      type: 'actionOutputDelta';
    }
  | { elicitation: ElicitationSnapshot; type: 'elicitation' };

export function conversationMessages(
  snapshot: ConversationSnapshot
): ChatHistoryMessage[] {
  const messages: ChatHistoryMessage[] = [];

  for (const entry of snapshot.history.replay) {
    const text = entry.content.text;
    if (!text.trim()) continue;
    messages.push({
      content: [{ text, type: entry.role === 'reasoning' ? 'reasoning' : 'text' }],
      id: `history-${messages.length}`,
      role: entry.role === 'user' ? 'user' : 'assistant',
    });
  }

  for (const turn of snapshot.turns) {
    const inputText = turn.inputText?.trim();
    if (inputText) {
      messages.push({
        content: [{ text: inputText, type: 'text' }],
        id: `${turn.id}:user`,
        role: 'user',
      });
    }

    const content = contentFromTurnSnapshot(
      turn,
      snapshot.actions.filter((action) => action.turnId === turn.id)
    );
    if (content.length > 0) {
      messages.push({
        content,
        id: `${turn.id}:assistant`,
        role: 'assistant',
      });
    }
  }

  return messages;
}

export function runtimeConfigFromConversationSnapshot(
  snapshot: ConversationSnapshot
): ChatRuntimeConfig {
  return {
    canSetReasoningEffort: snapshot.reasoning.canSet,
    currentMode:
      snapshot.context.mode ?? snapshot.modes?.currentModeId ?? null,
    currentModel:
      snapshot.context.model ?? snapshot.models?.currentModelId ?? null,
    currentReasoningEffort: snapshot.reasoning.currentEffort ?? null,
    modes:
      snapshot.modes?.availableModes.map((mode) => ({
        description: mode.description,
        label: mode.name || mode.id,
        value: mode.id,
      })) ?? optionsForConfig(snapshot, 'mode'),
    models:
      snapshot.models?.availableModels.map((model) => ({
        description: model.description,
        label: model.name || model.id,
        value: model.id,
      })) ?? optionsForConfig(snapshot, 'model'),
    reasoningEfforts: snapshot.reasoning.availableEfforts.map((effort) => ({
      label: labelFromConfigValue(effort),
      value: effort,
    })),
  };
}

export function projectRunResult(result: TurnRunResult) {
  const content = result.turn
    ? contentFromTurnSnapshot(result.turn, result.actions)
    : [];
  if (content.length === 0 && result.text.trim()) {
    content.push({ text: result.text, type: 'text' });
  }

  return {
    config: result.conversation
      ? runtimeConfigFromConversationSnapshot(result.conversation)
      : undefined,
    content,
    model: result.model,
    reasoning: result.reasoning,
    remoteThreadId: result.remoteThreadId,
    text: result.text,
    turnId: result.turnId,
  };
}

export function createTurnEventProjector(
  onEvent?: (
    event:
      | ChatStreamDelta
      | { action: ChatToolAction; type: 'tool' }
  ) => void
) {
  const actions = new Map<string, ChatToolAction>();
  const parts: ChatHistoryMessagePart[] = [];

  return {
    content() {
      return parts.map((part) =>
        part.type === 'tool-call'
          ? { ...part, artifact: cloneAction(part.artifact) }
          : { ...part }
      );
    },
    handle(event: RawTurnStreamEvent) {
      if (event.type === 'delta') {
        appendChatTextPart(parts, event.part, event.text);
        onEvent?.(event);
        return;
      }

      if (
        event.type === 'actionObserved' ||
        event.type === 'actionUpdated'
      ) {
        upsertAction(toChatAction(event.action));
        return;
      }

      if (event.type === 'actionOutputDelta') {
        const current =
          actions.get(event.actionId) ??
          toChatAction({
            id: event.actionId,
            kind: 'tool',
            output: [],
            phase: 'streamingResult',
            title: 'Tool call',
            turnId: event.turnId,
          } as ActionSnapshot);
        const output = [...(current.output ?? []), event.content];
        upsertAction({
          ...current,
          output,
          outputText: output.map((item) => item.text).join(''),
        });
        return;
      }

      upsertAction(actionFromElicitation(event.elicitation));
    },
  };

  function upsertAction(action: ChatToolAction) {
    actions.set(action.id, action);
    const part = chatToolActionToPart(action);
    const index = parts.findIndex(
      (item) => item.type === 'tool-call' && item.toolCallId === part.toolCallId
    );
    if (index === -1) {
      parts.push(part);
    } else {
      parts[index] = part;
    }
    onEvent?.({ action, type: 'tool' });
  }
}

function contentFromTurnSnapshot(
  turn: TurnSnapshot,
  actions: ActionSnapshot[]
): ChatHistoryMessagePart[] {
  const parts: ChatHistoryMessagePart[] = [];
  appendChatTextPart(
    parts,
    'reasoning',
    [turn.reasoningText, turn.planText]
      .filter((text) => Boolean(text?.trim()))
      .join('\n')
  );
  for (const action of actions) {
    parts.push(chatToolActionToPart(toChatAction(action)));
  }
  appendChatTextPart(parts, 'text', turn.outputText ?? '');
  return parts;
}

function optionsForConfig(
  snapshot: ConversationSnapshot,
  category: string
): ChatRuntimeConfigOption[] {
  return snapshot.configOptions
    .find((option) => option.category === category || option.id === category)
    ?.values.filter((value) => value.value)
    .map((value) => ({
      description: value.description,
      label: value.name || value.value,
      value: value.value,
    })) ?? [];
}

function actionFromElicitation(
  elicitation: ElicitationSnapshot
): ChatToolAction {
  return {
    id: elicitation.id,
    inputSummary:
      elicitation.body ??
      elicitation.questions
        .map((question) => question.question || question.header)
        .filter(Boolean)
        .join('\n') ??
      undefined,
    kind: 'elicitation',
    output: [],
    phase: 'awaitingDecision',
    rawInput: JSON.stringify(elicitation),
    title: elicitation.title ?? 'User input requested',
    turnId: elicitation.turnId ?? undefined,
  };
}

function toChatAction(action: ActionSnapshot): ChatToolAction {
  return {
    error: action.error,
    id: action.id,
    inputSummary: action.inputSummary,
    kind: action.kind,
    output: action.output,
    outputText: action.outputText,
    phase: action.phase,
    rawInput: action.rawInput,
    title: action.title,
    turnId: action.turnId,
  };
}

function cloneAction(action: ChatToolAction): ChatToolAction {
  return {
    ...action,
    error: action.error ? { ...action.error } : action.error,
    output: action.output?.map((item) => ({ ...item })),
  };
}

function labelFromConfigValue(value: string) {
  if (value === 'xhigh') return 'XHigh';
  if (value === 'default') return 'Default';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}
