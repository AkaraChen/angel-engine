import type { LocaleResource } from "./schema";

export const es = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "Cancelar",
      delete: "Eliminar",
      edit: "Editar",
      save: "Guardar",
      tryAgain: "Reintentar",
      newChat: "Nuevo chat",
      settings: "Ajustes",
      daemonOfflineHint:
        "Puede que el demonio esté desconectado o no se pueda alcanzar.",
      showLess: "Mostrar menos",
      showMore: "Mostrar más",
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
      filterSegments: "Filtrar chats",
      segmentEmpty: "Aquí no hay nada por ahora.",
      segments: {
        all: "Todo",
        attention: "Te necesita",
        running: "En curso",
        done: "Terminado",
      },
    },
    activity: {
      status: {
        waitingForYou: "Esperándote",
        failed: "Falló",
        stuck: "Atascado",
        running: "En curso",
        done: "Terminado",
      },
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
      plan: "Plan",
      todo: "Tareas",
      build: "Build",
      switchToPlan: "Cambiar a modo plan",
      switchToBuild: "Cambiar a modo build",
      planCreated: "{{title}} creado",
      planUpdated: "{{title}} actualizado",
      planProgress: "{{completed}}/{{total}}",
      couldNotChangeMode: "No se pudo cambiar el modo",
      attentionNeedsInput: "Necesita entrada",
      attentionNeedsInputDescription: "El agente está esperando tu respuesta.",
      attentionReview: "Revisar",
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
      projects: {
        actionError:
          "No se pudo completar esa acción del proyecto. Inténtalo de nuevo.",
        add: "Añadir proyecto",
        createTitle: "Añadir proyecto",
        deleteAria: "Eliminar {{name}}",
        deleteChecking: "Comprobando chats vinculados…",
        deleteImpact:
          "Al eliminar este proyecto se borrarán permanentemente {{count}} chats vinculados.",
        deleteImpactOne:
          "Al eliminar este proyecto se borrará permanentemente 1 chat vinculado.",
        deleteImpactUnknown:
          "Al eliminar este proyecto también se borrarán permanentemente sus chats vinculados.",
        deleteNoChats: "Este proyecto no tiene chats vinculados.",
        deleteTitle: "¿Eliminar proyecto?",
        description:
          "Los proyectos apuntan a carpetas del ordenador que ejecuta Angel Engine.",
        editAria: "Editar {{name}}",
        editTitle: "Editar proyecto",
        empty: "Aún no hay proyectos.",
        filesKept: "Los archivos de la carpeta del proyecto se conservarán.",
        formDescription:
          "Introduce una ruta de carpeta absoluta en el ordenador que ejecuta Angel Engine.",
        loadError: "No se pudieron cargar los proyectos.",
        pathInvalid: "Introduce la ruta de una carpeta existente.",
        pathLabel: "Ruta de la carpeta",
        pathPlaceholder: "/ruta/al/proyecto",
        title: "Proyectos",
      },
      customAgents: {
        actionError:
          "No se pudo completar esa acción del agente personalizado. Inténtalo de nuevo.",
        add: "Añadir agente personalizado",
        argsLabel: "Argumentos",
        argsPlaceholder: "Un argumento por línea",
        autoAuthenticateLabel: "Autenticar automáticamente",
        commandLabel: "Comando",
        createTitle: "Añadir agente personalizado",
        deleteAria: "Eliminar {{name}}",
        deleteChecking: "Comprobando chats vinculados…",
        deleteImpact:
          "Al eliminar este agente se borrarán permanentemente {{count}} chats vinculados.",
        deleteImpactOne:
          "Al eliminar este agente se borrará permanentemente 1 chat vinculado.",
        deleteImpactUnknown:
          "Al eliminar este agente también se borrarán permanentemente sus chats vinculados.",
        deleteNoChats: "Este agente no tiene chats vinculados.",
        deleteTitle: "¿Eliminar agente personalizado?",
        description:
          "Gestiona comandos ligeros de agentes compatibles con ACP.",
        editAria: "Editar {{name}}",
        editTitle: "Editar agente personalizado",
        empty: "Aún no hay agentes personalizados.",
        environmentHint:
          "Los valores de entorno se guardan localmente en texto sin formato.",
        environmentLabel: "Entorno",
        environmentPlaceholder: "NOMBRE=valor, uno por línea",
        formDescription:
          "Configura el comando y los argumentos opcionales para iniciar este agente.",
        loadError: "No se pudieron cargar los agentes personalizados.",
        nameLabel: "Nombre",
        needAuthLabel: "Requiere autenticación",
        title: "Agentes personalizados",
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
