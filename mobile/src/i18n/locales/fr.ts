import type { LocaleResource } from "./schema";

export const fr = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "Annuler",
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
    },
    elicitation: {
      defaultTitle: "L'agent a besoin de votre saisie",
      allow: "Autoriser",
      allowForSession: "Autoriser pour la session",
      deny: "Refuser",
      dismiss: "Ignorer",
    },
    createChat: {
      description:
        "Démarrez une session d'agent dans un projet ou un worktree.",
      promptLabel: "Invite initiale",
      promptPlaceholder: "Sur quoi l'agent doit-il travailler ?",
      projectLabel: "Projet",
      noProject: "Aucun projet (ponctuel)",
      agentLabel: "Agent",
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
