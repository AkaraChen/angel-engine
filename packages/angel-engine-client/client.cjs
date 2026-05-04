let native;
try {
  native = require('@angel-engine/client-napi');
} catch (error) {
  try {
    native = require('../../crates/angel-engine-client-napi/index.js');
  } catch {
    throw new Error(
      'Could not load the native angel-engine client binding. Run `bun run build:debug` in crates/angel-engine-client-napi before using this package from source.',
      { cause: error },
    );
  }
}

const TERMINAL_TOOL_PHASES = new Set([
  'completed',
  'failed',
  'declined',
  'cancelled',
]);

class AngelSession {
  constructor(options) {
    this.options =
      typeof options === 'string' || options === undefined
        ? createRuntimeOptions(options)
        : options;
    this.client = new native.AngelClient(this.options);
    this.conversationId = undefined;
    this.startPromise = undefined;
    this.operationQueue = Promise.resolve();
    this.pendingElicitations = new Map();
  }

  sendText(request) {
    return this.enqueue(() => this.sendTextNow(request));
  }

  async *runText(request) {
    const events = new AsyncEventQueue();
    const done = this.sendText({
      ...request,
      onEvent: (event) => events.push(event),
    })
      .then((result) => events.push({ result, type: 'result' }))
      .catch((error) =>
        events.push({
          message: error instanceof Error ? error.message : String(error),
          type: 'error',
        }),
      )
      .finally(() => events.push({ type: 'done' }));

    while (true) {
      const event = await events.next();
      yield event;
      if (event.type === 'done') break;
    }
    await done;
  }

  hydrate(request = {}) {
    return this.enqueue(() => this.hydrateNow(request));
  }

  inspect(cwd) {
    return this.enqueue(() => this.inspectNow(cwd));
  }

  hasConversation() {
    return Boolean(this.conversationId);
  }

  close() {
    for (const pending of this.pendingElicitations.values()) {
      pending.reject(new Error('Chat session closed.'));
    }
    this.pendingElicitations.clear();
    this.client.close();
  }

  enqueue(action) {
    const run = this.operationQueue.then(action);
    this.operationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async sendTextNow(request) {
    const text = String(request.text || '').trim();
    if (!text) {
      throw new Error('Text is required.');
    }

    throwIfAborted(request.signal);
    await this.ensureStarted({
      allowStart: true,
      cwd: request.cwd,
      remoteId: request.remoteId,
    });
    throwIfAborted(request.signal);

    const conversationId = this.requireConversationId();
    await this.ensureModel(conversationId, request.model);
    await this.ensureMode(conversationId, request.mode);
    await this.ensureReasoningEffort(conversationId, request.reasoningEffort);

    const result = this.client.sendText(conversationId, text);
    const collector = new TurnCollector(result.turnId, request.onEvent);
    request.onResolveElicitation?.((elicitationId, response) =>
      this.resolveElicitationNow(conversationId, elicitationId, response, collector),
    );
    await this.handleUpdate(result.update, collector);

    if (!result.turnId) {
      const content = collector.content();
      if (content.length === 0) {
        appendTextPart(
          content,
          'text',
          'The runtime accepted the message without starting a turn.',
        );
      }
      const snapshot = this.client.threadState(conversationId);
      return {
        config: snapshot ? runtimeConfigFromConversationSnapshot(snapshot) : undefined,
        content,
        model: currentModelFromSnapshot(snapshot),
        remoteThreadId: this.threadRemoteId(),
        text: partsText(content, 'text'),
      };
    }

    while (!this.client.turnIsTerminal(conversationId, result.turnId)) {
      if (request.signal?.aborted) {
        await this.cancelTurn(conversationId, result.turnId, collector);
        throwIfAborted(request.signal);
      }

      const [elicitation] = this.client.openElicitations(conversationId);
      if (elicitation) {
        await this.waitForElicitation(
          conversationId,
          elicitation,
          collector,
          request.signal,
        );
        continue;
      }

      await this.processNextUpdate(50, collector);
      await yieldToEventLoop();
    }

    const turn = this.client.turnState(conversationId, result.turnId);
    const snapshot = this.client.threadState(conversationId);
    const snapshotActions = snapshot?.actions ?? [];
    collector.reconcileActions(snapshotActions);
    const snapshotTurn = snapshot?.turns?.find((item) => item.id === result.turnId);
    const content = collector.content();
    const finalContent =
      content.length > 0
        ? content
        : contentFromTurnSnapshot(
            snapshotTurn ?? turn,
            actionsForTurn(snapshotActions, result.turnId),
          );
    const responseText =
      turn?.outputText ||
      snapshotTurn?.outputText ||
      partsText(finalContent, 'text') ||
      'The runtime finished without text output.';
    const reasoning =
      turn?.reasoningText ||
      snapshotTurn?.reasoningText ||
      partsText(finalContent, 'reasoning') ||
      undefined;

    return {
      config: snapshot ? runtimeConfigFromConversationSnapshot(snapshot) : undefined,
      content: finalContent,
      model: currentModelFromSnapshot(snapshot),
      reasoning,
      remoteThreadId: this.threadRemoteId(),
      text: responseText,
      turnId: result.turnId,
    };
  }

  async hydrateNow(request) {
    await this.ensureStarted({
      allowStart: false,
      cwd: request.cwd,
      remoteId: request.remoteId,
    });
    const snapshot = this.client.threadState(this.requireConversationId());
    if (!snapshot) {
      throw new Error('Runtime did not return a conversation snapshot.');
    }
    return snapshot;
  }

  async inspectNow(cwd) {
    await this.ensureStarted({
      allowStart: true,
      cwd,
      remoteId: undefined,
    });
    const snapshot = this.client.threadState(this.requireConversationId());
    if (!snapshot) {
      throw new Error('Runtime did not return a configuration snapshot.');
    }
    return runtimeConfigFromConversationSnapshot(snapshot);
  }

  async cancelTurn(conversationId, turnId, collector) {
    const result = this.client.sendThreadEvent(conversationId, {
      turnId,
      type: 'cancel',
    });
    await this.handleUpdate(result.update, collector);
  }

  async waitForElicitation(conversationId, elicitation, collector, signal) {
    collector.acceptElicitation(elicitation);

    await new Promise((resolve, reject) => {
      const rejectWithError = (error) => {
        signal?.removeEventListener?.('abort', abort);
        this.pendingElicitations.delete(elicitation.id);
        reject(error);
      };
      const resolvePending = () => {
        signal?.removeEventListener?.('abort', abort);
        resolve();
      };
      const abort = () => rejectWithError(new Error('Chat request cancelled.'));

      if (signal?.aborted) {
        abort();
        return;
      }

      this.pendingElicitations.set(elicitation.id, {
        conversationId,
        reject: rejectWithError,
        resolve: resolvePending,
      });
      signal?.addEventListener?.('abort', abort, { once: true });
    });
  }

  async resolveElicitationNow(conversationId, elicitationId, response, collector) {
    const pending = this.pendingElicitations.get(elicitationId);
    if (!pending || pending.conversationId !== conversationId) {
      throw new Error('Chat stream is not waiting for this user input.');
    }

    try {
      collector.resolveElicitation(elicitationId, response);
      const result = this.client.resolveElicitation(
        conversationId,
        elicitationId,
        response,
      );
      await this.handleUpdate(result.update, collector);
      pending.resolve();
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      this.pendingElicitations.delete(elicitationId);
    }
  }

  async ensureStarted({ allowStart, cwd, remoteId }) {
    this.startPromise ??= this.start({ allowStart, cwd, remoteId }).catch((error) => {
      this.startPromise = undefined;
      throw error;
    });
    await this.startPromise;
  }

  async start({ allowStart, cwd, remoteId }) {
    await this.handleUpdate(await this.client.initialize());

    const result = remoteId
      ? await this.client.resumeThread({
          additionalDirectories: [],
          hydrate: true,
          remoteId,
        })
      : allowStart
        ? await this.client.startThread({
            cwd: cwd || process.cwd(),
          })
        : undefined;

    if (!result) {
      throw new Error('Conversation has no remote thread to resume.');
    }

    this.conversationId = result.conversationId;
    await this.handleUpdate(result.update);
  }

  async ensureReasoningEffort(conversationId, requestedEffort) {
    const effort =
      selectedConfigValue(requestedEffort) ??
      selectedConfigValue(this.options.defaultReasoningEffort) ??
      selectedConfigValue(process.env.ANGEL_ENGINE_REASONING_EFFORT);
    if (!effort || effort === 'default') return;

    const reasoning = this.client.threadState(conversationId)?.reasoning;
    if (
      reasoning?.canSet === false ||
      reasoning?.currentEffort === effort ||
      (reasoning?.availableEfforts?.length &&
        !reasoning.availableEfforts.includes(effort))
    ) {
      return;
    }

    const result = this.client.setReasoningEffort(conversationId, effort);
    await this.handleUpdate(result.update);
    await this.drainConfigurationUpdates();
  }

  async ensureModel(conversationId, requestedModel) {
    const model = selectedConfigValue(requestedModel);
    if (!model) return;

    const snapshot = this.client.threadState(conversationId);
    const currentModel = currentModelFromSnapshot(snapshot);
    if (currentModel === model) return;
    if (!canSetModel(snapshot, model)) return;

    const result = this.client.setModel(conversationId, model);
    await this.handleUpdate(result.update);
    await this.drainConfigurationUpdates();
  }

  async ensureMode(conversationId, requestedMode) {
    const mode = String(requestedMode ?? '').trim();
    if (!mode) return;

    const snapshot = this.client.threadState(conversationId);
    const currentMode = currentModeFromSnapshot(snapshot);
    if (mode === 'default' && !currentMode) return;
    if (currentMode === mode) return;
    if (!canSetMode(this.options.runtime, snapshot, mode)) return;

    const result = this.client.setMode(conversationId, mode);
    await this.handleUpdate(result.update);
    await this.drainConfigurationUpdates();
  }

  async drainConfigurationUpdates() {
    while (await this.processNextUpdate(250)) {
      await yieldToEventLoop();
    }
  }

  async processNextUpdate(timeout, collector) {
    const update = await this.client.nextUpdate(timeout);
    if (!update) return false;
    await this.handleUpdate(update, collector);
    return true;
  }

  async handleUpdate(update, collector) {
    const streamDeltas = update?.streamDeltas ?? [];
    const events = update?.events ?? [];
    const hasOrderedStreamEvents = events.some(isOrderedStreamEvent);

    for (const event of events) {
      if (event.type === 'runtimeFaulted') {
        throw new Error(`Runtime faulted (${event.code}): ${event.message}`);
      }
      collector?.acceptEvent(event);
    }

    if (!hasOrderedStreamEvents) {
      for (const delta of streamDeltas) {
        collector?.acceptDelta(delta);
      }
    }
  }

  requireConversationId() {
    if (!this.conversationId) {
      throw new Error('Runtime did not start a conversation.');
    }
    return this.conversationId;
  }

  threadRemoteId() {
    if (!this.conversationId) return undefined;
    return this.client.threadState(this.conversationId)?.remoteId ?? undefined;
  }
}

class TurnCollector {
  constructor(turnId, onEvent) {
    this.turnId = turnId;
    this.onEvent = onEvent;
    this.actionPartIndexes = new Map();
    this.parts = [];
  }

  acceptDelta(delta) {
    this.accept(delta);
  }

  acceptEvent(event) {
    this.accept(event);
  }

  acceptElicitation(elicitation) {
    if (!this.acceptsTurn(elicitation.turnId ?? undefined)) return;
    this.upsertAction(actionFromElicitation(elicitation));
  }

  resolveElicitation(elicitationId, response) {
    const current = this.actionForId(elicitationId);
    this.upsertAction({
      id: elicitationId,
      kind: current?.kind ?? 'elicitation',
      outputText: elicitationResponseText(response),
      phase: phaseFromElicitationResponse(response),
      rawInput: current?.rawInput,
      title: current?.title ?? 'User input',
      turnId: current?.turnId ?? this.turnId,
    });
  }

  content() {
    return this.parts.map(cloneHistoryPart);
  }

  reconcileActions(actions) {
    for (const action of actions) {
      if (!this.acceptsTurn(action.turnId)) continue;
      if (!this.actionPartIndexes.has(action.id)) continue;
      this.upsertAction(action);
    }
  }

  accept(event) {
    if (
      (event.type === 'actionObserved' || event.type === 'actionUpdated') &&
      event.action
    ) {
      this.upsertAction(event.action);
      return;
    }

    if (event.type === 'actionOutputDelta') {
      if (event.actionId) this.acceptActionOutputDelta(event);
      return;
    }

    if (!this.acceptsTurn(event.turnId)) return;

    const text = event.content?.text;
    if (!text) return;

    if (event.type === 'assistantDelta') {
      appendTextPart(this.parts, 'text', text);
      this.onEvent?.({ part: 'text', text, turnId: event.turnId, type: 'delta' });
    } else if (event.type === 'reasoningDelta' || event.type === 'planDelta') {
      appendTextPart(this.parts, 'reasoning', text);
      this.onEvent?.({
        part: 'reasoning',
        text,
        turnId: event.turnId,
        type: 'delta',
      });
    }
  }

  acceptsTurn(turnId) {
    return !turnId || !this.turnId || turnId === this.turnId;
  }

  acceptActionOutputDelta(delta) {
    if (!delta.actionId || !this.acceptsTurn(delta.turnId)) return;

    const currentIndex = this.actionPartIndexes.get(delta.actionId);
    const current =
      currentIndex === undefined ? undefined : this.parts[currentIndex];
    const currentAction =
      current?.type === 'tool-call' ? current.artifact : undefined;
    const output = [
      ...(currentAction?.output ?? []),
      ...(delta.content ? [delta.content] : []),
    ];
    const outputText = output.map((item) => item.text).join('');

    this.upsertAction({
      id: delta.actionId,
      kind: currentAction?.kind ?? 'tool',
      output,
      outputText,
      phase: currentAction?.phase ?? 'streamingResult',
      title: currentAction?.title ?? 'Tool call',
      turnId: delta.turnId,
    });
  }

  actionForId(actionId) {
    const index = this.actionPartIndexes.get(actionId);
    const part = index === undefined ? undefined : this.parts[index];
    return part?.type === 'tool-call' ? part.artifact : undefined;
  }

  upsertAction(action) {
    if (!this.acceptsTurn(action.turnId)) return;

    const part = toolActionToPart(action);
    const index = this.actionPartIndexes.get(action.id);
    if (index === undefined) {
      this.actionPartIndexes.set(action.id, this.parts.length);
      this.parts.push(part);
    } else {
      this.parts[index] = part;
    }

    this.onEvent?.({ action, type: 'tool' });
  }
}

class AsyncEventQueue {
  constructor() {
    this.items = [];
    this.waiters = [];
  }

  next() {
    const item = this.items.shift();
    if (item !== undefined) {
      return Promise.resolve(item);
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  push(item) {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
      return;
    }

    this.items.push(item);
  }
}

function createRuntimeOptions(runtimeName, overrides = {}) {
  const runtime = normalizeRuntimeName(runtimeName ?? process.env.ANGEL_ENGINE_RUNTIME);
  const identity = overrides.identity ?? {
    name: overrides.clientName ?? 'angel-engine-client-node',
    title: overrides.clientTitle ?? 'Angel Engine Client',
  };
  const command = overrides.command ?? process.env.ANGEL_ENGINE_COMMAND;

  if (runtime === 'kimi') {
    return {
      args: overrides.args ?? ['acp'],
      auth: overrides.auth ?? { autoAuthenticate: true, needAuth: true },
      command: command ?? 'kimi',
      identity,
      protocol: 'acp',
      runtime,
      ...withoutPresetKeys(overrides),
    };
  }

  if (runtime === 'opencode') {
    return {
      args: overrides.args ?? ['acp'],
      auth: overrides.auth ?? { autoAuthenticate: false, needAuth: false },
      command: command ?? 'opencode',
      identity,
      protocol: 'acp',
      runtime,
      ...withoutPresetKeys(overrides),
    };
  }

  return {
    args: overrides.args ?? ['app-server'],
    command: command ?? 'codex',
    identity,
    protocol: 'codexAppServer',
    runtime: 'codex',
    ...withoutPresetKeys(overrides),
  };
}

function withoutPresetKeys(value) {
  const {
    args,
    auth,
    clientName,
    clientTitle,
    command,
    identity,
    ...rest
  } = value;
  return rest;
}

function normalizeRuntimeName(runtime) {
  const value = String(runtime ?? '').trim().toLowerCase();
  if (value === 'kimi') return 'kimi';
  if (value === 'opencode' || value === 'open-code' || value === 'open code') {
    return 'opencode';
  }
  return 'codex';
}

function conversationMessages(snapshot) {
  const replayMessages = messagesFromHistoryReplay(snapshot.history?.replay ?? []);
  const turnMessages = messagesFromTurns(snapshot.turns ?? [], snapshot.actions ?? []);
  return [...replayMessages, ...turnMessages];
}

function messagesFromTurns(turns, actions) {
  const messages = [];

  for (const turn of turns) {
    const inputText = turn.inputText?.trim();
    if (inputText) {
      messages.push({
        content: [{ text: inputText, type: 'text' }],
        id: `${turn.id}:user`,
        role: 'user',
      });
    }

    const content = contentFromTurnSnapshot(turn, actionsForTurn(actions, turn.id));
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

function messagesFromHistoryReplay(replay) {
  const messages = [];
  let userText = '';
  let assistantParts = [];
  let messageIndex = 0;

  const flushUser = () => {
    const text = userText.trim();
    if (!text) return;
    messages.push({
      content: [{ text, type: 'text' }],
      id: `history-${messageIndex++}:user`,
      role: 'user',
    });
    userText = '';
  };

  const flushAssistant = () => {
    assistantParts = assistantParts.filter(
      (part) => part.type === 'tool-call' || part.text.trim(),
    );
    if (assistantParts.length === 0) return;
    messages.push({
      content: assistantParts.map(cloneHistoryPart),
      id: `history-${messageIndex++}:assistant`,
      role: 'assistant',
    });
    assistantParts = [];
  };

  for (const [index, entry] of replay.entries()) {
    const text = entry.content?.text;
    if (!text) continue;

    if (entry.role === 'user') {
      flushAssistant();
      userText += text;
    } else if (entry.role === 'assistant') {
      flushUser();
      appendTextPart(assistantParts, 'text', text);
    } else if (entry.role === 'reasoning') {
      flushUser();
      appendTextPart(assistantParts, 'reasoning', text);
    } else if (entry.role === 'tool') {
      flushUser();
      assistantParts.push(historyToolPartFromText(text, index));
    }
  }

  flushUser();
  flushAssistant();
  return messages;
}

function contentFromTurnSnapshot(turn, actions = []) {
  const parts = [];
  const reasoningText = [turn?.reasoningText, turn?.planText]
    .filter((text) => Boolean(text?.trim()))
    .join('\n');

  appendTextPart(parts, 'reasoning', reasoningText);
  for (const action of actions) {
    parts.push(toolActionToPart(action));
  }
  appendTextPart(parts, 'text', turn?.outputText ?? '');

  return parts;
}

function actionsForTurn(actions, turnId) {
  return actions.filter((action) => action.turnId === turnId);
}

function historyToolPartFromText(text, index) {
  return toolActionToPart(historyToolActionFromText(text, index));
}

function historyToolActionFromText(text, index) {
  const parsed = parseJsonObject(text);
  const id =
    getString(parsed, 'toolCallId') ||
    getString(parsed, 'tool_call_id') ||
    getString(parsed, 'id') ||
    `history-tool-${index}`;
  const outputText = toolHistoryOutputText(parsed);

  return {
    id,
    kind: getString(parsed, 'kind') || getString(parsed, 'type') || 'tool',
    outputText,
    phase: getString(parsed, 'status') || 'completed',
    rawInput:
      getJsonString(parsed, 'rawInput') ||
      getJsonString(parsed, 'raw_input') ||
      undefined,
    title: getString(parsed, 'title') || getString(parsed, 'name') || 'Tool call',
  };
}

function runtimeConfigFromConversationSnapshot(snapshot) {
  const modelOption = findConfigOption(snapshot, 'model', ['model']);
  const modeOption = findConfigOption(snapshot, 'mode', ['mode']);

  return {
    canSetReasoningEffort: snapshot.reasoning?.canSet,
    currentMode: currentModeFromSnapshot(snapshot) ?? null,
    currentModel: currentModelFromSnapshot(snapshot) ?? null,
    currentReasoningEffort: snapshot.reasoning?.currentEffort ?? null,
    modes: optionsFromConfigOption(modeOption).length
      ? optionsFromConfigOption(modeOption)
      : optionsFromModes(snapshot),
    models: optionsFromConfigOption(modelOption).length
      ? optionsFromConfigOption(modelOption)
      : optionsFromModels(snapshot),
    reasoningEfforts: optionsFromReasoning(snapshot),
  };
}

function currentModelFromSnapshot(snapshot) {
  return snapshot?.context?.model ?? snapshot?.models?.currentModelId ?? undefined;
}

function currentModeFromSnapshot(snapshot) {
  return snapshot?.context?.mode ?? snapshot?.modes?.currentModeId ?? undefined;
}

function optionsFromConfigOption(option) {
  return (option?.values ?? [])
    .filter((value) => Boolean(value.value))
    .map((value) => ({
      description: value.description,
      label: value.name || value.value,
      value: value.value,
    }));
}

function optionsFromModels(snapshot) {
  return (snapshot.models?.availableModels ?? []).map((model) => ({
    description: model.description,
    label: model.name || model.id,
    value: model.id,
  }));
}

function optionsFromModes(snapshot) {
  return (snapshot.modes?.availableModes ?? []).map((mode) => ({
    description: mode.description,
    label: mode.name || mode.id,
    value: mode.id,
  }));
}

function optionsFromReasoning(snapshot) {
  return (snapshot.reasoning?.availableEfforts ?? []).map((effort) => ({
    label: labelFromConfigValue(effort),
    value: effort,
  }));
}

function canSetMode(runtime, snapshot, mode) {
  const option = findConfigOption(snapshot, 'mode', ['mode']);
  if (option?.values?.length) {
    return option.values.some((value) => value.value === mode);
  }

  const availableModes = snapshot?.modes?.availableModes ?? [];
  if (availableModes.length > 0) {
    return availableModes.some((availableMode) => availableMode.id === mode);
  }
  return runtime === 'codex' && (mode === 'default' || mode === 'plan');
}

function canSetModel(snapshot, model) {
  const option = findConfigOption(snapshot, 'model', ['model']);
  if (option?.values?.length) {
    return option.values.some((value) => value.value === model);
  }

  const availableModels = snapshot?.models?.availableModels ?? [];
  if (availableModels.length > 0) {
    return availableModels.some((availableModel) => availableModel.id === model);
  }

  return true;
}

function findConfigOption(snapshot, category, ids) {
  const options = snapshot?.configOptions ?? [];
  return (
    options.find((option) => option.category === category) ??
    options.find((option) =>
      ids.some(
        (id) =>
          option.id?.toLowerCase() === id.toLowerCase() ||
          normalizeConfigName(option.id) === normalizeConfigName(id),
      ),
    ) ??
    options.find((option) =>
      ids.some((id) => normalizeConfigName(option.name) === normalizeConfigName(id)),
    )
  );
}

function actionFromElicitation(elicitation) {
  return {
    id: elicitation.id,
    inputSummary: elicitationInputSummary(elicitation),
    kind: 'elicitation',
    phase: 'awaitingDecision',
    rawInput: JSON.stringify(elicitation),
    title: elicitation.title || titleFromElicitationKind(elicitation.kind),
    turnId: elicitation.turnId ?? undefined,
  };
}

function elicitationInputSummary(elicitation) {
  if (elicitation.body?.trim()) return elicitation.body;

  const questions = elicitation.questions ?? [];
  if (questions.length > 0) {
    return questions
      .map((question) => question.question || question.header)
      .filter(Boolean)
      .join('\n');
  }

  if (elicitation.choices?.length) {
    return elicitation.choices.join(', ');
  }

  return undefined;
}

function titleFromElicitationKind(kind) {
  switch (kind) {
    case 'approval':
    case 'permission':
      return 'Approval requested';
    case 'externalFlow':
      return 'External action requested';
    case 'userInput':
      return 'Input requested';
    default:
      return 'User input requested';
  }
}

function phaseFromElicitationResponse(response) {
  if (response.type === 'deny') return 'declined';
  if (response.type === 'cancel') return 'cancelled';
  return 'completed';
}

function elicitationResponseText(response) {
  switch (response.type) {
    case 'allow':
      return 'Allowed';
    case 'allowForSession':
      return 'Allowed for session';
    case 'deny':
      return 'Denied';
    case 'cancel':
      return 'Cancelled';
    case 'answers':
      return response.answers.map((answer) => `${answer.id}: ${answer.value}`).join('\n');
    case 'dynamicToolResult':
      return response.success ? 'Succeeded' : 'Failed';
    case 'externalComplete':
      return 'Completed externally';
    case 'raw':
      return response.value;
    default:
      return '';
  }
}

function isOrderedStreamEvent(event) {
  return (
    event.type === 'actionObserved' ||
    event.type === 'actionUpdated' ||
    event.type === 'assistantDelta' ||
    event.type === 'planDelta' ||
    event.type === 'reasoningDelta'
  );
}

function toolActionToPart(action) {
  const outputText = action.outputText?.trim() ? action.outputText : undefined;
  const errorText = action.error?.message;
  const result = outputText ?? errorText;

  return {
    args: parseJsonObject(action.rawInput) ?? {},
    argsText: action.rawInput || action.inputSummary || '',
    artifact: action,
    ...(action.error ? { isError: true } : {}),
    ...(result ? { result } : {}),
    toolCallId: action.id,
    toolName: action.kind || 'tool',
    type: 'tool-call',
  };
}

function cloneHistoryPart(part) {
  if (part.type === 'tool-call') {
    return {
      ...part,
      artifact: cloneAction(part.artifact),
    };
  }
  return { ...part };
}

function cloneAction(action) {
  return {
    ...action,
    error: action.error ? { ...action.error } : action.error,
    output: action.output?.map((item) => ({ ...item })),
  };
}

function appendTextPart(parts, type, text) {
  if (!text) return;

  const last = parts.at(-1);
  if (last?.type === type) {
    last.text += text;
    return;
  }

  parts.push({ text, type });
}

function partsText(parts, type) {
  return parts.reduce(
    (text, part) => (part.type === type ? text + part.text : text),
    '',
  );
}

function isTerminalToolPhase(phase) {
  return TERMINAL_TOOL_PHASES.has(phase);
}

function parseJsonObject(text) {
  if (!text) return undefined;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function getString(object, key) {
  const value = object?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

function getJsonString(object, key) {
  const value = object?.[key];
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function toolHistoryOutputText(object) {
  const rawOutput =
    getJsonString(object, 'rawOutput') || getJsonString(object, 'raw_output');
  if (rawOutput) return rawOutput;

  const content = object?.content;
  if (!Array.isArray(content)) return '';

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const nested = item.content;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return getString(nested, 'text') ?? '';
      }
      return getString(item, 'text') ?? '';
    })
    .filter(Boolean)
    .join('\n');
}

function labelFromConfigValue(value) {
  if (value === 'xhigh') return 'XHigh';
  if (value === 'default') return 'Default';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function normalizeConfigName(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function selectedConfigValue(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed === 'default') return undefined;
  return trimmed;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new Error('Chat request cancelled.');
  }
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

module.exports = {
  ...native,
  AngelSession,
  appendTextPart,
  cloneHistoryPart,
  conversationMessages,
  createRuntimeOptions,
  isTerminalToolPhase,
  normalizeRuntimeName,
  partsText,
  runtimeConfigFromConversationSnapshot,
  toolActionToPart,
};
