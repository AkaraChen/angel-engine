import type { LocaleResource } from "./schema";

export const fr = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "Annuler",
      delete: "Supprimer",
      edit: "Modifier",
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
      attentionCompleted: "Terminé",
      attentionNeedsInput: "Saisie requise",
      attentionNeedsInputDescription: "L’agent attend votre réponse.",
      attentionReview: "Voir",
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
      projects: {
        actionError:
          "Impossible d'effectuer cette action sur le projet. Veuillez réessayer.",
        add: "Ajouter un projet",
        createTitle: "Ajouter un projet",
        deleteAria: "Supprimer {{name}}",
        deleteChecking: "Vérification des discussions liées…",
        deleteImpact:
          "La suppression de ce projet supprimera définitivement {{count}} discussions liées.",
        deleteImpactOne:
          "La suppression de ce projet supprimera définitivement 1 discussion liée.",
        deleteImpactUnknown:
          "La suppression de ce projet supprimera aussi définitivement ses discussions liées.",
        deleteNoChats: "Ce projet n'a aucune discussion liée.",
        deleteTitle: "Supprimer le projet ?",
        description:
          "Les projets pointent vers des dossiers sur l'ordinateur qui exécute Angel Engine.",
        editAria: "Modifier {{name}}",
        editTitle: "Modifier le projet",
        empty: "Aucun projet pour le moment.",
        filesKept: "Les fichiers du dossier du projet seront conservés.",
        formDescription:
          "Saisissez un chemin de dossier absolu sur l'ordinateur qui exécute Angel Engine.",
        loadError: "Impossible de charger les projets.",
        pathInvalid: "Saisissez le chemin d'un dossier existant.",
        pathLabel: "Chemin du dossier",
        pathPlaceholder: "/chemin/du/projet",
        title: "Projets",
      },
      customAgents: {
        actionError:
          "Impossible d'effectuer cette action sur l'agent personnalisé. Veuillez réessayer.",
        add: "Ajouter un agent personnalisé",
        argsLabel: "Arguments",
        argsPlaceholder: "Un argument par ligne",
        autoAuthenticateLabel: "S'authentifier automatiquement",
        commandLabel: "Commande",
        createTitle: "Ajouter un agent personnalisé",
        deleteAria: "Supprimer {{name}}",
        deleteChecking: "Vérification des discussions liées…",
        deleteImpact:
          "La suppression de cet agent supprimera définitivement {{count}} discussions liées.",
        deleteImpactOne:
          "La suppression de cet agent supprimera définitivement 1 discussion liée.",
        deleteImpactUnknown:
          "La suppression de cet agent supprimera aussi définitivement ses discussions liées.",
        deleteNoChats: "Cet agent n'a aucune discussion liée.",
        deleteTitle: "Supprimer l'agent personnalisé ?",
        description:
          "Gérez des commandes légères d'agents compatibles avec ACP.",
        editAria: "Modifier {{name}}",
        editTitle: "Modifier l'agent personnalisé",
        empty: "Aucun agent personnalisé pour le moment.",
        environmentHint:
          "Les valeurs d'environnement sont stockées localement en texte brut.",
        environmentLabel: "Environnement",
        environmentPlaceholder: "NOM=valeur, un par ligne",
        formDescription:
          "Configurez la commande et les arguments facultatifs utilisés pour démarrer cet agent.",
        loadError: "Impossible de charger les agents personnalisés.",
        nameLabel: "Nom",
        needAuthLabel: "Authentification requise",
        title: "Agents personnalisés",
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
