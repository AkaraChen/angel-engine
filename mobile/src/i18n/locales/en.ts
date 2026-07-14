import type { LocaleResource } from "./schema";

export const en = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "Cancel",
      tryAgain: "Try again",
      newChat: "New chat",
      settings: "Settings",
      daemonOfflineHint: "The daemon may be offline or unreachable.",
    },
    login: {
      title: "Unlock Angel Engine",
      description:
        "Enter the pairing password set on your desktop app to connect this device.",
      passwordLabel: "Password",
      passwordPlaceholder: "Pairing password",
      incorrectPassword: "Incorrect password. Try again.",
      connectionError:
        "Couldn't reach the desktop app. Check your connection and try again.",
      connecting: "Connecting…",
      connect: "Connect",
    },
    shell: {
      backToChats: "Back to chats",
      titleChats: "Chats",
      titleChatFallback: "Chat",
    },
    sidebar: {
      home: "Home",
    },
    daemonStatus: {
      unreachable: "Daemon unreachable",
      connecting: "Connecting to daemon…",
      online: "Daemon online · v{{version}}",
    },
    home: {
      emptyTitle: "No chats yet",
      emptyDescription: "Start a new agent session to see it here.",
      errorTitle: "Couldn't load chats",
    },
    chat: {
      thinking: "Thinking…",
      turnFailed: "The assistant turn failed.",
      emptyTitle: "No messages yet",
      emptyDescription: "Send a message to start the conversation.",
      errorTitle: "Couldn't load this chat",
      messagePlaceholder: "Message",
      sendAria: "Send",
      stopAria: "Stop",
    },
    elicitation: {
      defaultTitle: "The agent needs your input",
      allow: "Allow",
      allowForSession: "Allow for session",
      deny: "Deny",
      dismiss: "Dismiss",
    },
    createChat: {
      description: "Start an agent session in a project or worktree.",
      promptLabel: "Initial prompt",
      promptPlaceholder: "What should the agent work on?",
      projectLabel: "Project",
      noProject: "No project (ad hoc)",
      agentLabel: "Agent",
      modelLabel: "Model",
      modelPlaceholder: "Default",
      reasoningLabel: "Reasoning",
      reasoningOptions: {
        default: "Default",
        minimal: "Minimal",
        low: "Low",
        medium: "Medium",
        high: "High",
      },
      worktreeTitle: "Run in a new worktree",
      worktreeDescription: "Isolate this chat in its own git worktree",
      worktreeHint: "Select a project to run in a worktree.",
      error:
        "Couldn't create the chat. Check the daemon connection and try again.",
      create: "Create chat",
    },
    settings: {
      appearance: {
        title: "Appearance",
        theme: "Theme",
        themeDescription: "Choose how the app looks on this device.",
        themeOptions: {
          system: "System",
          light: "Light",
          dark: "Dark",
        },
        language: "Language",
        languageDescription: "Choose the language for this device.",
        languageOptions: {
          en: "English",
          "zh-CN": "简体中文",
          "zh-TW": "繁體中文",
          fr: "Français",
          de: "Deutsch",
          ko: "한국어",
          ja: "日本語",
          es: "Español",
        },
      },
      about: {
        title: "About",
        description:
          "These settings only affect this device and are kept separate from the desktop app's configuration.",
        appName: "Angel Engine Mobile",
        appDescription: "Mobile companion for the Angel Engine desktop app.",
      },
    },
  },
} satisfies LocaleResource;
