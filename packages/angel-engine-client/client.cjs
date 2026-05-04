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

class AngelSession {
  constructor(options) {
    this.options =
      typeof options === 'string' || options === undefined
        ? createRuntimeOptions(options)
        : options;
    this.session = new native.AngelSession(this.options);
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
    return this.enqueue(() => this.session.hydrate(request));
  }

  inspect(cwd) {
    const request =
      cwd && typeof cwd === 'object' && !Array.isArray(cwd) ? cwd : { cwd };
    return this.enqueue(() => this.session.inspect(request));
  }

  hasConversation() {
    return this.session.hasConversation();
  }

  close() {
    for (const pending of this.pendingElicitations.values()) {
      pending.reject(new Error('Chat session closed.'));
    }
    this.pendingElicitations.clear();
    this.session.close();
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
    const text = String(request?.text || '').trim();
    if (!text) {
      throw new Error('Text is required.');
    }

    throwIfAborted(request.signal);
    request.onResolveElicitation?.((elicitationId, response) =>
      this.resolveElicitationNow(elicitationId, response),
    );

    let events = await this.session.startTextTurn({
      cwd: request.cwd,
      mode: request.mode,
      model: request.model,
      reasoningEffort: request.reasoningEffort,
      remoteId: request.remoteId,
      text,
    });

    while (true) {
      const result = await this.dispatchEvents(events, request);
      if (result) return result;

      if (request.signal?.aborted) {
        await this.cancelNativeTurn().catch(() => undefined);
        throwIfAborted(request.signal);
      }

      const event = await this.session.nextTurnEvent(50);
      events = event ? [event] : [];
      if (events.length === 0) {
        await yieldToEventLoop();
      }
    }
  }

  async dispatchEvents(events, request) {
    for (const event of events) {
      if (!event) continue;

      if (event.type === 'delta') {
        request.onEvent?.({
          part: event.part,
          text: event.text,
          turnId: event.turnId,
          type: 'delta',
        });
        continue;
      }

      if (event.type === 'action') {
        request.onEvent?.({ action: event.action, type: 'action' });
        continue;
      }

      if (event.type === 'actionOutputDelta') {
        request.onEvent?.({
          actionId: event.actionId,
          content: event.content,
          turnId: event.turnId,
          type: 'actionOutputDelta',
        });
        continue;
      }

      if (event.type === 'elicitation') {
        request.onEvent?.({ elicitation: event.elicitation, type: 'elicitation' });
        const followup = await this.waitForElicitation(
          event.elicitation,
          request.signal,
        );
        const result = await this.dispatchEvents(followup, request);
        if (result) return result;
        continue;
      }

      if (event.type === 'result') {
        return event.result;
      }
    }

    return undefined;
  }

  waitForElicitation(elicitation, signal) {
    if (!elicitation?.id) {
      return Promise.reject(new Error('Runtime opened an invalid elicitation.'));
    }
    return this.preparePendingElicitation(elicitation.id, signal).promise;
  }

  preparePendingElicitation(elicitationId, signal) {
    const existing = this.pendingElicitations.get(elicitationId);
    if (existing) return existing;

    let cleanup = () => undefined;
    const pending = {
      promise: undefined,
      reject: undefined,
      resolve: undefined,
    };
    pending.promise = new Promise((resolve, reject) => {
      const abort = () => {
        this.cancelNativeTurn().catch(() => undefined);
        pending.reject(abortError(signal));
      };
      cleanup = () => {
        signal?.removeEventListener?.('abort', abort);
        this.pendingElicitations.delete(elicitationId);
      };
      pending.resolve = (events = []) => {
        cleanup();
        resolve(events);
      };
      pending.reject = (error) => {
        cleanup();
        reject(error);
      };
      signal?.addEventListener?.('abort', abort, { once: true });
    });

    this.pendingElicitations.set(elicitationId, pending);
    if (signal?.aborted) {
      pending.reject(abortError(signal));
    }
    return pending;
  }

  async resolveElicitationNow(elicitationId, response) {
    const pending = this.pendingElicitations.get(elicitationId);
    if (!pending) {
      throw new Error('Chat stream is not waiting for this user input.');
    }

    try {
      pending.resolve(
        await this.session.resolveElicitation(elicitationId, response),
      );
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async cancelNativeTurn() {
    for (const pending of this.pendingElicitations.values()) {
      pending.reject(new Error('Chat request cancelled.'));
    }
    this.pendingElicitations.clear();
    return this.session.cancelTurn();
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
  return native.createRuntimeOptions(runtimeName ?? null, overrides ?? null);
}

function normalizeRuntimeName(runtime) {
  return native.normalizeRuntimeName(runtime ?? null);
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw abortError(signal);
  }
}

function abortError(signal) {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error('Chat request cancelled.');
  error.name = 'AbortError';
  return error;
}

function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

module.exports = {
  AngelClient: native.AngelClient,
  AngelEngineClient: native.AngelEngineClient,
  AngelSession,
  answersResponse: native.answersResponse,
  createRuntimeOptions,
  normalizeClientOptions: native.normalizeClientOptions,
  normalizeRuntimeName,
  textThreadEvent: native.textThreadEvent,
};
