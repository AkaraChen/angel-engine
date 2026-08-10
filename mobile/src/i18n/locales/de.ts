import type { LocaleResource } from "./schema";

export const de = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "Abbrechen",
      delete: "Löschen",
      edit: "Bearbeiten",
      save: "Speichern",
      tryAgain: "Erneut versuchen",
      newChat: "Neuer Chat",
      settings: "Einstellungen",
      daemonOfflineHint:
        "Der Daemon ist möglicherweise offline oder nicht erreichbar.",
      showLess: "Weniger anzeigen",
      showMore: "Mehr anzeigen",
    },
    login: {
      title: "Angel Engine entsperren",
      description:
        "Gib das in der Desktop-App festgelegte Kopplungspasswort ein, um dieses Gerät zu verbinden.",
      passwordLabel: "Passwort",
      passwordPlaceholder: "Kopplungspasswort",
      passwordHelp: "Passwörter unterscheiden Groß- und Kleinschreibung.",
      showPassword: "Passwort anzeigen",
      hidePassword: "Passwort verbergen",
      incorrectPassword: "Falsches Passwort. Versuche es erneut.",
      connectionError:
        "Die Desktop-App konnte nicht erreicht werden. Prüfe deine Verbindung und versuche es erneut.",
      recoveryHint:
        "Wenn du ein neues Kopplungspasswort brauchst, setze es unter Desktop-Einstellungen → Mobile-Ansicht zurück und kehre dann hierher zurück.",
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
      navigationTitle: "Navigation",
      navigationDescription: "Wichtige Ziele in Angel Engine.",
      close: "Navigation schließen",
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
      activityErrorTitle: "Aktivität konnte nicht geladen werden",
      errorTitle: "Chats konnten nicht geladen werden",
      filterSegments: "Chats filtern",
      segmentEmpty: "Hier ist gerade nichts.",
      segments: {
        all: "Alle",
        attention: "Für dich",
        running: "Läuft",
        done: "Fertig",
      },
    },
    activity: {
      status: {
        waitingForYou: "Wartet auf dich",
        failed: "Fehlgeschlagen",
        stuck: "Hängt",
        running: "Läuft",
        done: "Fertig",
      },
    },
    chat: {
      thinking: "Denkt nach…",
      turnFailed: "Der Assistenten-Durchlauf ist fehlgeschlagen.",
      emptyTitle: "Noch keine Nachrichten",
      emptyDescription:
        "Sende eine Nachricht, um die Unterhaltung zu beginnen.",
      errorTitle: "Dieser Chat konnte nicht geladen werden",
      runFailedTitle: "Der letzte Lauf ist fehlgeschlagen",
      messagePlaceholder: "Nachricht",
      sendAria: "Senden",
      stopAria: "Stoppen",
      attachAria: "Dateien anhängen",
      attachments: "Anhänge",
      removeAttachment: "{{name}} entfernen",
      retryAttachment: "{{name}} erneut versuchen",
      roleUser: "Du",
      roleAssistant: "Assistent",
      sendFailed:
        "Die Nachricht konnte nicht gesendet werden. Dein Entwurf ist noch da – versuche es erneut.",
      attachmentErrors: {
        accept: "Dieser Dateityp wird nicht unterstützt.",
        maxFileSize: "Jede Datei darf höchstens 10 MB groß sein.",
        maxFiles: "Du kannst bis zu 5 Dateien anhängen.",
        fileRead:
          "Die Datei konnte nicht gelesen werden. Erneut versuchen oder entfernen.",
      },
      plan: "Plan",
      todo: "Todo",
      build: "Build",
      switchToPlan: "Zum Plan-Modus wechseln",
      switchToBuild: "Zum Build-Modus wechseln",
      planCreated: "{{title}} erstellt",
      planUpdated: "{{title}} aktualisiert",
      planProgress: "{{completed}}/{{total}}",
      couldNotChangeMode: "Modus konnte nicht gewechselt werden",
      attentionNeedsInput: "Eingabe erforderlich",
      attentionNeedsInputDescription: "Der Agent wartet auf deine Antwort.",
      attentionReview: "Ansehen",
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
      promptRequired: "Schreibe zuerst einen Prompt.",
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
      connection: {
        title: "Verbindung",
        description:
          "Dieser Browser ist mit einem lokalen Angel-Engine-Daemon gekoppelt. Trennen löscht nur das Token auf diesem Gerät.",
        server: "Gekoppelter Server",
        sameOrigin: "Ursprung dieser Seite",
        status: "Status",
        statusOnline: "Verbunden",
        statusConnecting: "Verbinden…",
        statusUnreachable: "Nicht erreichbar",
        daemonVersion: "Daemon-Version",
        versionUnknown: "Unbekannt",
        disconnectSectionTitle: "Dieses Gerät",
        disconnectDescription:
          "Trennen entfernt nur das Kopplungstoken dieses Browsers. Das Desktop-Passwort und Chats bleiben unverändert.",
        disconnect: "Dieses Gerät trennen",
        disconnectConfirmTitle: "Dieses Gerät trennen?",
        disconnectConfirmDescription:
          "Zum erneuten Verbinden brauchst du das Kopplungspasswort. Chats und das Desktop-Passwort bleiben unverändert.",
        disconnectConfirm: "Trennen",
      },
      projects: {
        actionError:
          "Die Projektaktion konnte nicht abgeschlossen werden. Versuche es erneut.",
        add: "Projekt hinzufügen",
        createTitle: "Projekt hinzufügen",
        deleteAria: "{{name}} löschen",
        deleteChecking: "Verknüpfte Chats werden geprüft…",
        deleteConflict:
          "Das Projekt wurde inzwischen geändert. Bitte erneut prüfen.",
        deleteImpact:
          "Beim Löschen dieses Projekts werden {{count}} verknüpfte Chats dauerhaft gelöscht.",
        deleteImpactOne:
          "Beim Löschen dieses Projekts wird 1 verknüpfter Chat dauerhaft gelöscht.",
        deleteImpactUnknown:
          "Beim Löschen dieses Projekts werden auch seine verknüpften Chats dauerhaft gelöscht.",
        deleteNoChats: "Dieses Projekt hat keine verknüpften Chats.",
        deleteTitle: "Projekt löschen?",
        description:
          "Projekte verweisen auf Ordner auf dem Computer, auf dem Angel Engine ausgeführt wird.",
        editAria: "{{name}} bearbeiten",
        editTitle: "Projekt bearbeiten",
        empty: "Noch keine Projekte.",
        filesKept: "Die Dateien im Projektordner bleiben erhalten.",
        formDescription:
          "Gib einen absoluten Ordnerpfad auf dem Computer ein, auf dem Angel Engine ausgeführt wird.",
        loadError: "Projekte konnten nicht geladen werden.",
        pathInvalid: "Gib den Pfad zu einem vorhandenen Ordner ein.",
        pathLabel: "Ordnerpfad",
        pathPlaceholder: "/pfad/zum/projekt",
        pathRequired: "Gib einen Ordnerpfad ein.",
        title: "Projekte",
      },
      customAgents: {
        actionError:
          "Die Aktion für den benutzerdefinierten Agent konnte nicht abgeschlossen werden. Versuche es erneut.",
        add: "Benutzerdefinierten Agent hinzufügen",
        argsLabel: "Argumente",
        argsPlaceholder: "Ein Argument pro Zeile",
        autoAuthenticateLabel: "Automatisch authentifizieren",
        commandLabel: "Befehl",
        commandRequired: "Gib einen Befehl ein.",
        createTitle: "Benutzerdefinierten Agent hinzufügen",
        deleteAria: "{{name}} löschen",
        deleteChecking: "Verknüpfte Chats werden geprüft…",
        deleteImpact:
          "Beim Löschen dieses Agents werden {{count}} verknüpfte Chats dauerhaft gelöscht.",
        deleteImpactOne:
          "Beim Löschen dieses Agents wird 1 verknüpfter Chat dauerhaft gelöscht.",
        deleteImpactUnknown:
          "Beim Löschen dieses Agents werden auch seine verknüpften Chats dauerhaft gelöscht.",
        deleteNoChats: "Dieser Agent hat keine verknüpften Chats.",
        deleteTitle: "Benutzerdefinierten Agent löschen?",
        description: "Verwalte schlanke ACP-kompatible Agent-Befehle.",
        editAria: "{{name}} bearbeiten",
        editTitle: "Benutzerdefinierten Agent bearbeiten",
        empty: "Noch keine benutzerdefinierten Agents.",
        environmentHint:
          "Umgebungswerte werden lokal als Klartext gespeichert.",
        environmentLabel: "Umgebung",
        environmentPlaceholder: "NAME=Wert, einer pro Zeile",
        formDescription:
          "Konfiguriere den Befehl und optionale Argumente zum Starten dieses Agents.",
        loadError: "Benutzerdefinierte Agents konnten nicht geladen werden.",
        nameLabel: "Name",
        nameRequired: "Gib einen Namen ein.",
        needAuthLabel: "Authentifizierung erforderlich",
        title: "Benutzerdefinierte Agents",
      },
      about: {
        appDescription: "Mobiler Begleiter für die Angel-Engine-Desktop-App.",
        appName: "Angel Engine Mobile",
        build: "Build",
        copied: "Kopiert",
        copyDiagnostics: "Diagnosedaten kopieren",
        copyFailed:
          "Kopieren fehlgeschlagen. Kopiere die Angaben stattdessen von Hand.",
        description:
          "Diese Einstellungen betreffen nur dieses Gerät und bleiben von der Konfiguration der Desktop-App getrennt.",
        diagnostics: "Diagnose",
        title: "Über",
      },
    },
  },
} satisfies LocaleResource;
