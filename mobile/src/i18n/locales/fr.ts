import type { LocaleResource } from "./schema";

export const fr = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "Annuler",
      delete: "Supprimer",
      save: "Enregistrer",
      tryAgain: "Réessayer",
      newChat: "Nouvelle discussion",
      settings: "Paramètres",
      daemonOfflineHint: "Le démon est peut-être hors ligne ou injoignable.",
    },
    login: {
      title: "Déverrouiller Angel Engine",
      description:
        "Saisissez le mot de passe d'appairage défini dans votre application de bureau pour connecter cet appareil.",
      passwordLabel: "Mot de passe",
      passwordPlaceholder: "Mot de passe d'appairage",
      incorrectPassword: "Mot de passe incorrect. Réessayez.",
      connectionError:
        "Impossible de joindre l'application de bureau. Vérifiez votre connexion et réessayez.",
      connecting: "Connexion…",
      connect: "Se connecter",
    },
    shell: {
      backToChats: "Retour aux discussions",
      titleChats: "Discussions",
      titleChatFallback: "Discussion",
    },
    sidebar: {
      home: "Accueil",
    },
    daemonStatus: {
      unreachable: "Démon injoignable",
      connecting: "Connexion au démon…",
      online: "Démon en ligne · v{{version}}",
    },
    home: {
      emptyTitle: "Aucune discussion",
      emptyDescription:
        "Démarrez une nouvelle session d'agent pour la voir apparaître ici.",
      errorTitle: "Impossible de charger les discussions",
    },
    chat: {
      thinking: "Réflexion…",
      turnFailed: "Le tour de l'assistant a échoué.",
      emptyTitle: "Aucun message",
      emptyDescription: "Envoyez un message pour démarrer la conversation.",
      errorTitle: "Impossible de charger cette discussion",
      messagePlaceholder: "Message",
      sendAria: "Envoyer",
      stopAria: "Arrêter",
      plan: "Plan",
      todo: "Tâches",
      build: "Build",
      switchToPlan: "Passer en mode plan",
      switchToBuild: "Passer en mode build",
      planCreated: "{{title}} créé",
      planUpdated: "{{title}} mis à jour",
      planProgress: "{{completed}}/{{total}}",
      couldNotChangeMode: "Impossible de changer de mode",
    },
    elicitation: {
      defaultTitle: "L'agent a besoin de votre saisie",
      allow: "Autoriser",
      allowForSession: "Autoriser pour la session",
      deny: "Refuser",
      dismiss: "Ignorer",
      submit: "Submit",
      other: "Other",
      question: "Question",
      userInput: "User input",
      dynamicTool: "Dynamic tool",
      permissionProfile: "Permission profile",
      externalFlow: "External flow",
    },
    createChat: {
      description:
        "Démarrez une session d'agent dans un projet ou un worktree.",
      promptLabel: "Invite initiale",
      promptPlaceholder: "Sur quoi l'agent doit-il travailler ?",
      projectLabel: "Projet",
      noProject: "Aucun projet (ponctuel)",
      agentLabel: "Agent",
      agentsError: "Impossible de charger les agents.",
      noAgents: "Aucun agent disponible",
      modelLabel: "Modèle",
      modelPlaceholder: "Par défaut",
      reasoningLabel: "Raisonnement",
      reasoningOptions: {
        default: "Par défaut",
        minimal: "Minimal",
        low: "Faible",
        medium: "Moyen",
        high: "Élevé",
      },
      worktreeTitle: "Exécuter dans un nouveau worktree",
      worktreeDescription:
        "Isoler cette discussion dans son propre worktree git",
      worktreeHint: "Sélectionnez un projet pour exécuter dans un worktree.",
      error:
        "Impossible de créer la discussion. Vérifiez la connexion au démon et réessayez.",
      create: "Créer la discussion",
    },
    settings: {
      projects: {
        title: "Projets",
        description:
          "Supprimer un projet ne supprime jamais ses fichiers de l’ordinateur.",
        empty: "Aucun projet.",
        add: "Ajouter un projet",
        createTitle: "Ajouter un projet",
        editTitle: "Modifier le projet",
        formDescription:
          "Saisissez le chemin d’un dossier existant sur l’ordinateur.",
        pathLabel: "Chemin du projet",
        pathPlaceholder: "/Users/you/project",
        editAction: "Modifier {{name}}",
        deleteAction: "Supprimer {{name}}",
        deleteTitle: "Supprimer {{name}} ?",
        deleteWithoutChats:
          "Le projet sera retiré d’Angel Engine. Les fichiers resteront sur le disque.",
        deleteWithChats:
          "Le projet et ses {{count}} discussions associées seront supprimés. Les fichiers resteront sur le disque.",
        loadError: "Impossible de charger les projets.",
        saveError: "Impossible d’enregistrer le projet.",
        deleteError: "Impossible de supprimer le projet.",
      },
      customAgents: {
        title: "Agents personnalisés",
        description:
          "Les agents restent sur l’ordinateur. Les variables d’environnement sont stockées localement en texte brut.",
        empty: "Aucun agent personnalisé.",
        add: "Ajouter un agent",
        createTitle: "Ajouter un agent personnalisé",
        editTitle: "Modifier l’agent personnalisé",
        formDescription:
          "Configurez une commande compatible ACP exécutée sur l’ordinateur.",
        nameLabel: "Nom",
        commandLabel: "Commande",
        commandPlaceholder: "mon-agent",
        argsLabel: "Arguments, un par ligne",
        argsPlaceholder: "acp\n--stdio",
        environmentLabel: "Environnement, un NAME=value par ligne",
        environmentPlaceholder: "API_KEY=value",
        needAuth: "Authentification requise",
        autoAuthenticate: "S’authentifier automatiquement",
        editAction: "Modifier {{name}}",
        deleteAction: "Supprimer {{name}}",
        deleteTitle: "Supprimer {{name}} ?",
        deleteWithoutChats: "L’agent personnalisé sera retiré d’Angel Engine.",
        deleteWithChats:
          "L’agent personnalisé et les {{count}} discussions qui l’utilisent seront supprimés.",
        loadError: "Impossible de charger les agents personnalisés.",
        saveError: "Impossible d’enregistrer l’agent personnalisé.",
        deleteError: "Impossible de supprimer l’agent personnalisé.",
      },
      appearance: {
        title: "Apparence",
        theme: "Thème",
        themeDescription: "Choisissez l'apparence de l'app sur cet appareil.",
        themeOptions: {
          system: "Système",
          light: "Clair",
          dark: "Sombre",
        },
        language: "Langue",
        languageDescription: "Choisissez la langue de cet appareil.",
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
        title: "À propos",
        description:
          "Ces paramètres n'affectent que cet appareil et restent distincts de la configuration de l'application de bureau.",
        appName: "Angel Engine Mobile",
        appDescription:
          "Compagnon mobile de l'application de bureau Angel Engine.",
      },
    },
  },
} satisfies LocaleResource;
