import type { LocaleResource } from "./schema";

export const es = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "Cancelar",
      tryAgain: "Reintentar",
      newChat: "Nuevo chat",
      settings: "Ajustes",
      daemonOfflineHint:
        "Puede que el demonio esté desconectado o no se pueda alcanzar.",
    },
    login: {
      title: "Desbloquear Angel Engine",
      description:
        "Introduce la contraseña de emparejamiento configurada en tu app de escritorio para conectar este dispositivo.",
      passwordLabel: "Contraseña",
      passwordPlaceholder: "Contraseña de emparejamiento",
      incorrectPassword: "Contraseña incorrecta. Inténtalo de nuevo.",
      connectionError:
        "No se pudo contactar con la app de escritorio. Comprueba tu conexión e inténtalo de nuevo.",
      connecting: "Conectando…",
      connect: "Conectar",
    },
    shell: {
      backToChats: "Volver a los chats",
      titleChats: "Chats",
      titleChatFallback: "Chat",
    },
    sidebar: {
      home: "Inicio",
    },
    daemonStatus: {
      unreachable: "Demonio inaccesible",
      connecting: "Conectando con el demonio…",
      online: "Demonio en línea · v{{version}}",
    },
    home: {
      emptyTitle: "Aún no hay chats",
      emptyDescription: "Inicia una nueva sesión de agente para verla aquí.",
      errorTitle: "No se pudieron cargar los chats",
    },
    chat: {
      thinking: "Pensando…",
      turnFailed: "El turno del asistente falló.",
      emptyTitle: "Aún no hay mensajes",
      emptyDescription: "Envía un mensaje para empezar la conversación.",
      errorTitle: "No se pudo cargar este chat",
      messagePlaceholder: "Mensaje",
      sendAria: "Enviar",
      stopAria: "Detener",
    },
    elicitation: {
      defaultTitle: "El agente necesita tu entrada",
      allow: "Permitir",
      allowForSession: "Permitir durante la sesión",
      deny: "Denegar",
      dismiss: "Descartar",
      submit: "Submit",
      other: "Other",
      question: "Question",
      userInput: "User input",
      dynamicTool: "Dynamic tool",
      permissionProfile: "Permission profile",
      externalFlow: "External flow",
    },
    createChat: {
      description: "Inicia una sesión de agente en un proyecto o worktree.",
      promptLabel: "Instrucción inicial",
      promptPlaceholder: "¿En qué debería trabajar el agente?",
      projectLabel: "Proyecto",
      noProject: "Sin proyecto (ad hoc)",
      agentLabel: "Agente",
      modelLabel: "Modelo",
      modelPlaceholder: "Predeterminado",
      reasoningLabel: "Razonamiento",
      reasoningOptions: {
        default: "Predeterminado",
        minimal: "Mínimo",
        low: "Bajo",
        medium: "Medio",
        high: "Alto",
      },
      worktreeTitle: "Ejecutar en un nuevo worktree",
      worktreeDescription: "Aislar este chat en su propio worktree de git",
      worktreeHint: "Selecciona un proyecto para ejecutar en un worktree.",
      error:
        "No se pudo crear el chat. Comprueba la conexión con el demonio e inténtalo de nuevo.",
      create: "Crear chat",
    },
    settings: {
      appearance: {
        title: "Apariencia",
        theme: "Tema",
        themeDescription: "Elige cómo se ve la app en este dispositivo.",
        themeOptions: {
          system: "Sistema",
          light: "Claro",
          dark: "Oscuro",
        },
        language: "Idioma",
        languageDescription: "Elige el idioma de este dispositivo.",
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
        title: "Acerca de",
        description:
          "Estos ajustes solo afectan a este dispositivo y se mantienen separados de la configuración de la app de escritorio.",
        appName: "Angel Engine Mobile",
        appDescription: "Compañero móvil de la app de escritorio Angel Engine.",
      },
    },
  },
} satisfies LocaleResource;
