import type { LocaleResource } from "./schema";

export const de = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "Abbrechen",
      tryAgain: "Erneut versuchen",
      newChat: "Neuer Chat",
      settings: "Einstellungen",
      daemonOfflineHint:
        "Der Daemon ist möglicherweise offline oder nicht erreichbar.",
    },
    login: {
      title: "Angel Engine entsperren",
      description:
        "Gib das in der Desktop-App festgelegte Kopplungspasswort ein, um dieses Gerät zu verbinden.",
      passwordLabel: "Passwort",
      passwordPlaceholder: "Kopplungspasswort",
      incorrectPassword: "Falsches Passwort. Versuche es erneut.",
      connectionError:
        "Die Desktop-App konnte nicht erreicht werden. Prüfe deine Verbindung und versuche es erneut.",
      connecting: "Verbinden…",
      connect: "Verbinden",
    },
    shell: {
      backToChats: "Zurück zu den Chats",
      titleChats: "Chats",
      titleChatFallback: "Chat",
    },
    sidebar: {
      home: "Start",
    },
    daemonStatus: {
      unreachable: "Daemon nicht erreichbar",
      connecting: "Verbinde mit Daemon…",
      online: "Daemon online · v{{version}}",
    },
    home: {
      emptyTitle: "Noch keine Chats",
      emptyDescription:
        "Starte eine neue Agent-Sitzung, damit sie hier erscheint.",
      errorTitle: "Chats konnten nicht geladen werden",
    },
    chat: {
      thinking: "Denkt nach…",
      turnFailed: "Der Assistenten-Durchlauf ist fehlgeschlagen.",
      emptyTitle: "Noch keine Nachrichten",
      emptyDescription:
        "Sende eine Nachricht, um die Unterhaltung zu beginnen.",
      errorTitle: "Dieser Chat konnte nicht geladen werden",
      messagePlaceholder: "Nachricht",
      sendAria: "Senden",
      stopAria: "Stoppen",
    },
    elicitation: {
      defaultTitle: "Der Agent benötigt deine Eingabe",
      allow: "Zulassen",
      allowForSession: "Für Sitzung zulassen",
      deny: "Ablehnen",
      dismiss: "Verwerfen",
      submit: "Submit",
      other: "Other",
      question: "Question",
      userInput: "User input",
      dynamicTool: "Dynamic tool",
      permissionProfile: "Permission profile",
      externalFlow: "External flow",
    },
    createChat: {
      description: "Starte eine Agent-Sitzung in einem Projekt oder Worktree.",
      promptLabel: "Erste Eingabe",
      promptPlaceholder: "Woran soll der Agent arbeiten?",
      projectLabel: "Projekt",
      noProject: "Kein Projekt (ad hoc)",
      agentLabel: "Agent",
      modelLabel: "Modell",
      modelPlaceholder: "Standard",
      reasoningLabel: "Reasoning",
      reasoningOptions: {
        default: "Standard",
        minimal: "Minimal",
        low: "Niedrig",
        medium: "Mittel",
        high: "Hoch",
      },
      worktreeTitle: "In neuem Worktree ausführen",
      worktreeDescription:
        "Diesen Chat in einem eigenen git-Worktree isolieren",
      worktreeHint: "Wähle ein Projekt, um in einem Worktree auszuführen.",
      error:
        "Der Chat konnte nicht erstellt werden. Prüfe die Daemon-Verbindung und versuche es erneut.",
      create: "Chat erstellen",
    },
    settings: {
      appearance: {
        title: "Darstellung",
        theme: "Design",
        themeDescription: "Lege fest, wie die App auf diesem Gerät aussieht.",
        themeOptions: {
          system: "System",
          light: "Hell",
          dark: "Dunkel",
        },
        language: "Sprache",
        languageDescription: "Wähle die Sprache für dieses Gerät.",
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
        title: "Über",
        description:
          "Diese Einstellungen betreffen nur dieses Gerät und bleiben von der Konfiguration der Desktop-App getrennt.",
        appName: "Angel Engine Mobile",
        appDescription: "Mobiler Begleiter für die Angel-Engine-Desktop-App.",
      },
    },
  },
} satisfies LocaleResource;
