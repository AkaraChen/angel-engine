#!/usr/bin/env node

import { createRequire } from 'node:module'
import process from 'node:process'
import readline from 'node:readline'

const require = createRequire(import.meta.url)
const { AngelClient } = require('../index.js')

class NodeAngelCli {
  constructor(runtime) {
    this.runtime = runtime
    this.client = new AngelClient(runtime.options)
    this.conversationId = null
    this.inlineOutput = null
    this.input = null
  }

  async start() {
    await this.handleUpdate(await this.client.initialize())

    const start = await this.client.startThread({ cwd: process.cwd() })
    this.conversationId = required(start.conversationId, 'startThread did not return a conversation id')
    await this.handleUpdate(start.update)
    this.printBanner()
  }

  async runRepl() {
    while (true) {
      const input = await this.question(this.runtime.prompt)
      if (input === null) {
        break
      }
      const line = input.trim()
      if (!line) {
        continue
      }
      if (isQuitCommand(line)) {
        break
      }
      if (line === '/commands') {
        this.printAvailableCommandList()
        continue
      }
      if (await this.handleSettingCommand(line)) {
        continue
      }
      if (line.startsWith('/shell ')) {
        if (this.runtime.directShell) {
          await this.sendThreadEvent({ type: 'runShellCommand', command: line.slice('/shell '.length) })
          await this.pumpUntilNoActivity(250)
          console.log()
        } else {
          console.log('[warn] direct shell command is only available for codex')
        }
        continue
      }
      if (line.startsWith('/')) {
        await this.runSlashCommand(line)
        continue
      }
      await this.runTurn(line)
    }
  }

  async handleSettingCommand(line) {
    const [command, ...rest] = line.split(/\s+/)
    const value = rest.join(' ').trim()
    if (command === '/model') {
      if (!value) {
        this.printModelState()
      } else {
        await this.sendAndFlush(() => this.client.setModel(this.requireConversationId(), value))
        await this.pumpUntilNoActivity(250)
        console.log(`[state] model set to ${value}`)
      }
    } else if (command === '/mode') {
      if (!value) {
        this.printModeState()
      } else {
        await this.sendAndFlush(() => this.client.setMode(this.requireConversationId(), value))
        await this.pumpUntilNoActivity(250)
        console.log(`[state] mode set to ${value}`)
        if (this.codexModeNeedsModelWarning(value)) {
          console.log(
            '[warn] Codex collaborationMode requires a model in turn/start; set /model first if the next turn does not switch mode',
          )
        }
      }
    } else if (command === '/effort' || command === '/reasoning') {
      if (!value) {
        this.printEffortState()
      } else {
        const reasoning = required(this.currentConversation(), 'selected conversation missing').reasoning
        const effort = normalizeReasoningEffort(reasoning, value)
        if (!effort) {
          const values = reasoning?.availableEfforts || []
          console.log(values.length ? `[warn] use one of: ${values.join(', ')}` : '[warn] reasoning effort is unavailable for this runtime')
          return true
        }
        await this.sendAndFlush(() => this.client.setReasoningEffort(this.requireConversationId(), effort))
        await this.pumpUntilNoActivity(250)
        console.log(`[state] reasoning effort set to ${value}`)
      }
    } else {
      return false
    }
    return true
  }

  async runSlashCommand(commandLine) {
    const command = commandLine.slice(1).split(/\s+/)[0] || ''
    const availableCommands = this.currentCommands()
    const available = availableCommands.find((candidate) => candidate.name === command)
    if (available) {
      const input = commandLine.slice(available.name.length + 1).trim()
      if (!input && available.inputHint) {
        console.log(`[command] /${available.name} ${available.inputHint}`)
      }
    } else if (availableCommands.length > 0) {
      console.log(`[warn] slash command /${command} was not advertised; sending anyway`)
    }
    await this.runTurn(commandLine)
  }

  async runTurn(text) {
    const result = await this.sendAndFlush(() => this.client.sendText(this.requireConversationId(), text))
    if (!result.turnId) {
      return
    }
    while (!this.client.turnIsTerminal(this.requireConversationId(), result.turnId)) {
      if (await this.resolveOpenElicitation()) {
        continue
      }
      await this.processNextUpdate()
    }
    console.log()
  }

  async sendThreadEvent(event) {
    return this.sendAndFlush(() => this.client.sendThreadEvent(this.requireConversationId(), event))
  }

  async sendAndFlush(command) {
    const result = await command()
    await this.handleUpdate(result.update)
    return result
  }

  async pumpUntilNoActivity(timeout) {
    while (await this.processNextUpdate(timeout)) {}
  }

  async processNextUpdate(timeout) {
    const update = await this.client.nextUpdate(timeout)
    if (!update) return false
    await this.handleUpdate(update)
    return true
  }

  async handleUpdate(update = {}) {
    const streamDeltas = update.streamDeltas || []
    for (const delta of streamDeltas) {
      this.printStreamDelta(delta)
    }
    for (const log of update.logs || []) {
      if (log.kind === 'output' && streamDeltas.length > 0) {
        continue
      }
      this.printLog(log)
    }
    for (const event of update.events || []) {
      if (eventPrints(event)) {
        this.finishInlineOutput()
      }
      printEvent(event)
    }
  }

  async resolveOpenElicitation() {
    const conversationId = this.requireConversationId()
    const [elicitation] = this.client.openElicitations(conversationId)
    if (!elicitation) {
      return false
    }
    const response =
      elicitation.kind === 'userInput'
        ? await this.readUserInputResponse(elicitation)
        : await this.readApprovalResponse(elicitation)
    const result = this.client.resolveElicitation(conversationId, elicitation.id, response)
    await this.handleUpdate(result.update)
    return true
  }

  async readApprovalResponse(elicitation) {
    console.log(`[approval] ${elicitation.title || 'approval requested'}`)
    if (elicitation.body) {
      console.log(`[approval] ${elicitation.body}`)
    }
    if (elicitation.choices?.length) {
      console.log(`[approval] options: ${elicitation.choices.join(', ')}`)
    }
    const rawInput = await this.question('Allow? [y]es/[s]ession/[n]o/[c]ancel: ')
    if (rawInput === null) {
      return { type: 'cancel' }
    }
    const input = rawInput.trim().toLowerCase()
    if (input === 'y' || input === 'yes' || input === 'allow') {
      return { type: 'allow' }
    }
    if (input === 's' || input === 'session' || input === 'always') {
      return { type: 'allowForSession' }
    }
    if (input === 'c' || input === 'cancel') {
      return { type: 'cancel' }
    }
    return { type: 'deny' }
  }

  async readUserInputResponse(elicitation) {
    console.log(`[input] ${elicitation.title || 'input requested'}`)
    if (elicitation.body) {
      console.log(`[input] ${elicitation.body}`)
    }
    const questions = elicitation.questions || []
    if (questions.length === 0) {
      const input = await this.question('Type your answer, or :cancel to cancel: ')
      if (input === null) {
        return { type: 'cancel' }
      }
      return input.trim() === ':cancel'
        ? { type: 'cancel' }
        : { type: 'answers', answers: [{ id: 'answer', value: input.trim() }] }
    }
    const answers = []
    for (const question of questions) {
      printQuestion(question)
      const prompt = question.options?.length
        ? `Choose 1-${question.options.length} (or exact option text); use commas for multiple; :cancel to cancel: `
        : 'Type your answer, or :cancel to cancel: '
      const input = await this.question(prompt)
      if (input === null) {
        return { type: 'cancel' }
      }
      if (input.trim() === ':cancel') {
        return { type: 'cancel' }
      }
      const values = answerValues(question, input.trim())
      if (values.length === 0) {
        answers.push({ id: question.id, value: '' })
      } else {
        answers.push(...values.map((value) => ({ id: question.id, value })))
      }
    }
    return { type: 'answers', answers }
  }

  printBanner() {
    console.log(this.runtime.banner)
    if (this.runtime.directShell) {
      console.log('Type a message, /shell <command>, /model, /mode, /effort, or :quit.')
    } else {
      console.log('Type a message, /model, /mode, /effort, or :quit.')
    }
    this.printCommandSummary()
  }

  printCommandSummary() {
    const commands = this.currentCommands()
    if (!commands?.length) {
      return
    }
    const names = commands
      .slice(0, 8)
      .map((command) => `/${command.name}`)
      .join(', ')
    const suffix = commands.length > 8 ? ', ...' : ''
    console.log(`[commands] ${commands.length} available: ${names}${suffix}; type /commands to list`)
  }

  printAvailableCommandList() {
    const commands = this.currentCommands()
    if (!commands?.length) {
      console.log('[commands] no slash commands advertised')
      return
    }
    for (const command of commands) {
      const input = command.inputHint ? ` <${compactText(command.inputHint, 40)}>` : ''
      console.log(`[commands] /${command.name}${input} - ${compactText(command.description, 160)}`)
    }
  }

  currentCommands() {
    return this.currentConversation()?.availableCommands || []
  }

  currentConversation() {
    if (!this.conversationId) {
      return null
    }
    return this.client.threadState(this.conversationId)
  }

  printModelState() {
    const conversation = required(this.currentConversation(), 'selected conversation missing')
    const current = conversation.context?.model || conversation.models?.currentModelId || '(default)'
    console.log(`[model] current: ${current}`)
    const option = configOption(conversation, 'model', ['model'])
    if (option) {
      printConfigValues('[model]', option)
    } else if (conversation.models?.availableModels?.length) {
      printValues(
        '[model]',
        conversation.models.availableModels.map((model) => model.id),
      )
    }
  }

  printEffortState() {
    const conversation = required(this.currentConversation(), 'selected conversation missing')
    const reasoning = conversation.reasoning || {}
    const current = reasoning.currentEffort || '(default)'
    console.log(`[effort] current: ${current}`)
    if (reasoning.availableEfforts?.length) {
      printValues('[effort]', reasoning.availableEfforts)
    } else if (!reasoning.canSet) {
      console.log('[effort] unavailable for this runtime')
    }
  }

  printModeState() {
    const conversation = required(this.currentConversation(), 'selected conversation missing')
    const current = conversation.context?.mode || conversation.modes?.currentModeId || '(default)'
    console.log(`[mode] current: ${current}`)
    const option = configOption(conversation, 'mode', ['mode'])
    if (option) {
      printConfigValues('[mode]', option)
    } else if (conversation.modes?.availableModes?.length) {
      printValues(
        '[mode]',
        conversation.modes.availableModes.map((mode) => mode.id),
      )
    } else if (this.runtime.options.protocol === 'codexAppServer') {
      console.log('[mode] available: plan, default')
    }
  }

  currentModel() {
    const conversation = this.currentConversation()
    return conversation?.context?.model || conversation?.models?.currentModelId || null
  }

  codexModeNeedsModelWarning(value) {
    return (
      this.runtime.options.protocol === 'codexAppServer' &&
      (value === 'plan' || value === 'default') &&
      !this.currentModel()
    )
  }

  printLog(log) {
    if (log.kind !== 'output') {
      this.finishInlineOutput()
      printLogLine(log)
      return
    }
    const reasoningPrefix = '[reasoning] '
    if (log.message.startsWith(reasoningPrefix)) {
      if (this.inlineOutput !== 'reasoning') {
        this.finishInlineOutput()
        process.stdout.write('[reasoning] ')
        this.inlineOutput = 'reasoning'
      }
      process.stdout.write(log.message.slice(reasoningPrefix.length))
      return
    }
    if (this.inlineOutput === 'reasoning') {
      this.finishInlineOutput()
    }
    this.inlineOutput = 'assistant'
    process.stdout.write(log.message)
  }

  printStreamDelta(delta) {
    const text = delta.content?.text || ''
    if (!text) {
      return
    }
    if (delta.type === 'reasoningDelta' || delta.type === 'planDelta') {
      if (this.inlineOutput !== 'reasoning') {
        this.finishInlineOutput()
        process.stdout.write('[reasoning] ')
        this.inlineOutput = 'reasoning'
      }
      process.stdout.write(text)
      return
    }
    if (this.inlineOutput === 'reasoning') {
      this.finishInlineOutput()
    }
    this.inlineOutput = 'assistant'
    process.stdout.write(text)
  }

  finishInlineOutput() {
    if (this.inlineOutput) {
      console.log()
      this.inlineOutput = null
    }
  }

  requireConversationId() {
    return required(this.conversationId, 'conversation has not been started')
  }

  async question(prompt) {
    if (!this.input) {
      this.input = new StdinLineQueue()
    }
    process.stdout.write(prompt)
    return this.input.next()
  }

  close() {
    this.finishInlineOutput()
    this.input?.close()
    this.client.close()
  }
}

class StdinLineQueue {
  constructor() {
    this.items = []
    this.waiters = []
    this.closed = false
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: Boolean(process.stdin.isTTY),
    })
    this.rl.on('line', (line) => this.push(line))
    this.rl.on('close', () => this.finish())
  }

  push(line) {
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter(line)
    } else {
      this.items.push(line)
    }
  }

  next() {
    if (this.items.length > 0) {
      return Promise.resolve(this.items.shift())
    }
    if (this.closed) {
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }

  finish() {
    this.closed = true
    while (this.waiters.length > 0) {
      this.waiters.shift()(null)
    }
  }

  close() {
    this.rl.close()
  }
}

function runtimeFromArg(value = 'kimi') {
  if (value === 'kimi') {
    return {
      label: 'kimi',
      banner: 'angel-client node kimi cli',
      prompt: 'kimi> ',
      autoAuthenticate: true,
      directShell: false,
      options: {
        command: 'kimi',
        args: ['acp'],
        protocol: 'acp',
        auth: { needAuth: true, autoAuthenticate: true },
        identity: { name: 'angel-client-node-cli', title: 'Angel Client Node CLI' },
      },
    }
  }
  if (value === 'codex') {
    return {
      label: 'codex',
      banner: 'angel-client node codex cli',
      prompt: 'codex> ',
      autoAuthenticate: false,
      directShell: true,
      options: {
        command: 'codex',
        args: ['app-server'],
        protocol: 'codexAppServer',
        identity: { name: 'angel-client-node-cli', title: 'Angel Client Node CLI' },
      },
    }
  }
  if (value === 'opencode' || value === 'open-code') {
    return {
      label: 'opencode',
      banner: 'angel-client node opencode cli',
      prompt: 'opencode> ',
      autoAuthenticate: false,
      directShell: false,
      options: {
        command: 'opencode',
        args: ['acp'],
        protocol: 'acp',
        auth: { needAuth: false, autoAuthenticate: false },
        identity: { name: 'angel-client-node-cli', title: 'Angel Client Node CLI' },
      },
    }
  }
  throw new Error(`unknown runtime ${value}; use kimi, codex, or opencode`)
}

function printEvent(event) {
  if (event.type === 'runtimeAuthRequired') {
    console.log(`[auth] runtime requested auth: ${(event.methods || []).map((method) => method.label).join(', ')}`)
  } else if (event.type === 'runtimeReady') {
    console.log(`[runtime] ${event.name}${event.version ? ` ${event.version}` : ''} ready`)
  } else if (event.type === 'conversationReady') {
    const remote = event.conversation.remoteId || 'local'
    console.log(`[thread] ${event.conversation.id} ready (${remote})`)
  } else if (event.type === 'availableCommandsUpdated') {
    console.log(`[thread] ${event.conversationId} commands updated: ${event.count}`)
  } else if (event.type === 'sessionUsageUpdated') {
    console.log(`[usage] ${event.conversationId}: ${event.usage.used}/${event.usage.size}`)
  }
}

function eventPrints(event) {
  return [
    'runtimeAuthRequired',
    'runtimeReady',
    'conversationReady',
    'availableCommandsUpdated',
    'sessionUsageUpdated',
  ].includes(event.type)
}

function printLogLine(log) {
  if (log.kind === 'output') {
    return
  }
  const labels = {
    send: 'send',
    receive: 'recv',
    state: 'state',
    warning: 'warn',
    error: 'error',
    processStdout: 'stdout',
    processStderr: 'stderr',
  }
  const label = labels[log.kind] || log.kind
  console.log(`[${label}] ${log.message}`)
}

function printQuestion(question) {
  if (question.header) {
    console.log(`[input] ${question.header}`)
  }
  console.log(`[input] ${question.question}`)
  for (const [index, option] of (question.options || []).entries()) {
    const description = option.description ? ` - ${option.description}` : ''
    console.log(`[input] ${index + 1}. ${option.label}${description}`)
  }
}

function answerValues(question, input) {
  if (!question.options?.length) {
    return input ? [input] : []
  }
  return input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const index = Number(value)
      if (Number.isInteger(index) && index >= 1 && index <= question.options.length) {
        return question.options[index - 1].label
      }
      return value
    })
}

function compactText(text, maxChars) {
  const compact = String(text).split(/\s+/).join(' ')
  return compact.length <= maxChars ? compact : `${compact.slice(0, Math.max(0, maxChars - 3))}...`
}

function configOption(conversation, category, ids) {
  const options = conversation.configOptions || []
  return (
    options.find((option) => option.category === category) ||
    options.find((option) => ids.some((id) => option.id?.toLowerCase() === id.toLowerCase() || normalize(option.id) === normalize(id))) ||
    options.find((option) => ids.some((id) => normalize(option.name) === normalize(id)))
  )
}

function printConfigValues(prefix, option) {
  if (!option.values?.length) {
    console.log(`${prefix} option: ${option.id}`)
    return
  }
  printValues(
    prefix,
    option.values.map((value) => value.value),
  )
}

function printValues(prefix, values) {
  if (!values.length) {
    return
  }
  const shown = values.slice(0, 16).join(', ')
  const suffix = values.length > 16 ? ', ...' : ''
  console.log(`${prefix} available: ${shown}${suffix}`)
}

function normalize(value) {
  return String(value || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function normalizeReasoningEffort(reasoning, value) {
  if (!reasoning?.canSet) {
    return null
  }
  const values = reasoning.availableEfforts || []
  if (!values.length) {
    return value
  }
  return values.find((effort) => effort.toLowerCase() === value.toLowerCase()) || null
}

function isQuitCommand(line) {
  return line === ':q' || line === ':quit' || line === 'exit'
}

function required(value, message) {
  if (value === undefined || value === null) {
    throw new Error(message)
  }
  return value
}

const runtime = runtimeFromArg(process.argv[2])
const app = new NodeAngelCli(runtime)

try {
  await app.start()
  await app.runRepl()
} finally {
  app.close()
}
