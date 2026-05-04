#!/usr/bin/env node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AngelSession, createRuntimeOptions } = require('../client.cjs');

const runtime = process.argv[2] || process.env.ANGEL_ENGINE_RUNTIME || 'codex';
const prompt = process.argv.slice(3).join(' ');
const rl = readline.createInterface({ input, output });

const session = new AngelSession(
  createRuntimeOptions(runtime, {
    cwd: process.cwd(),
  }),
);
const settings = {
  mode: undefined,
  model: undefined,
  reasoningEffort: undefined,
};

let resolveElicitation;
let reasoningLineOpen = false;
let sawReasoningThisTurn = false;

try {
  if (prompt) {
    await runPrompt(prompt);
  } else {
    while (true) {
      const text = (await rl.question(`${runtime}> `)).trim();
      if (!text || text === ':q' || text === ':quit' || text === 'exit') break;
      if (handleCommand(text)) continue;
      await runPrompt(text);
      console.log();
    }
  }
} finally {
  rl.close();
  session.close();
}

async function runPrompt(text) {
  sawReasoningThisTurn = false;
  const result = await session.sendText({
    mode: settings.mode,
    model: settings.model,
    onEvent: handleEvent,
    onResolveElicitation: (handler) => {
      resolveElicitation = handler;
    },
    reasoningEffort: settings.reasoningEffort,
    text,
  });
  closeReasoningLine();
  if (result.reasoning && !sawReasoningThisTurn) {
    console.log(`[reasoning] ${result.reasoning}`);
  }
  if (!result.text.endsWith('\n')) {
    console.log();
  }
}

function handleEvent(event) {
  if (event.type === 'delta') {
    if (event.part === 'reasoning') {
      if (!reasoningLineOpen) {
        process.stdout.write('[reasoning] ');
        reasoningLineOpen = true;
      }
      sawReasoningThisTurn = true;
      process.stdout.write(event.text);
    } else {
      closeReasoningLine();
      process.stdout.write(event.text);
    }
    return;
  }

  closeReasoningLine();
  if (event.type === 'elicitation') {
    void answerElicitation(event.elicitation);
    return;
  }

  if (event.type === 'action') {
    const action = event.action;
    const title = action?.title || action?.kind || action?.id || 'action';
    console.log(`\n[tool call] ${title}`);
  }
}

function handleCommand(text) {
  const [command, ...rest] = text.split(/\s+/);
  const value = rest.join(' ').trim() || undefined;

  if (command === '/effort' || command === '/reasoning') {
    settings.reasoningEffort = value;
    console.log(`[state] reasoning effort ${value || 'default'}`);
    return true;
  }

  if (command === '/model') {
    settings.model = value;
    console.log(`[state] model ${value || 'default'}`);
    return true;
  }

  if (command === '/mode') {
    settings.mode = value;
    console.log(`[state] mode ${value || 'default'}`);
    return true;
  }

  return false;
}

function closeReasoningLine() {
  if (!reasoningLineOpen) return;
  process.stdout.write('\n');
  reasoningLineOpen = false;
}

async function answerElicitation(elicitation) {
  if (!resolveElicitation) return;
  const answer = (
    await rl.question(
      `\n[elicitation] ${elicitation.title || elicitation.body || 'Allow?'} [y/N] `,
    )
  )
    .trim()
    .toLowerCase();
  const response =
    answer === 'y' || answer === 'yes'
      ? { type: 'allow' }
      : { type: 'deny' };
  await resolveElicitation(elicitation.id, response);
}
