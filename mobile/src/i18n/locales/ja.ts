import type { LocaleResource } from "./schema";

export const ja = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "キャンセル",
      delete: "削除",
      save: "保存",
      tryAgain: "再試行",
      newChat: "新しいチャット",
      settings: "設定",
      daemonOfflineHint:
        "デーモンがオフラインか、到達できない可能性があります。",
    },
    login: {
      title: "Angel Engine のロック解除",
      description:
        "このデバイスを接続するには、デスクトップアプリで設定したペアリングパスワードを入力してください。",
      passwordLabel: "パスワード",
      passwordPlaceholder: "ペアリングパスワード",
      incorrectPassword:
        "パスワードが正しくありません。もう一度お試しください。",
      connectionError:
        "デスクトップアプリに接続できませんでした。接続を確認して再試行してください。",
      connecting: "接続中…",
      connect: "接続",
    },
    shell: {
      backToChats: "チャット一覧に戻る",
      titleChats: "チャット",
      titleChatFallback: "チャット",
    },
    sidebar: {
      home: "ホーム",
    },
    daemonStatus: {
      unreachable: "デーモンに到達できません",
      connecting: "デーモンに接続中…",
      online: "デーモン オンライン · v{{version}}",
    },
    home: {
      emptyTitle: "まだチャットがありません",
      emptyDescription:
        "新しいエージェントセッションを開始すると、ここに表示されます。",
      errorTitle: "チャットを読み込めませんでした",
    },
    chat: {
      thinking: "思考中…",
      turnFailed: "アシスタントのターンが失敗しました。",
      emptyTitle: "まだメッセージがありません",
      emptyDescription: "メッセージを送信して会話を始めましょう。",
      errorTitle: "このチャットを読み込めませんでした",
      messagePlaceholder: "メッセージ",
      sendAria: "送信",
      stopAria: "停止",
      plan: "プラン",
      todo: "Todo",
      build: "ビルド",
      switchToPlan: "プランモードに切り替え",
      switchToBuild: "ビルドモードに切り替え",
      planCreated: "{{title}} を作成",
      planUpdated: "{{title}} を更新",
      planProgress: "{{completed}}/{{total}}",
      couldNotChangeMode: "モードを変更できませんでした",
    },
    elicitation: {
      defaultTitle: "エージェントが入力を求めています",
      allow: "許可",
      allowForSession: "セッション中は許可",
      deny: "拒否",
      dismiss: "閉じる",
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
        "プロジェクトまたはワークツリーでエージェントセッションを開始します。",
      promptLabel: "最初のプロンプト",
      promptPlaceholder: "エージェントに何をさせますか？",
      projectLabel: "プロジェクト",
      noProject: "プロジェクトなし（アドホック）",
      agentLabel: "エージェント",
      agentsError: "エージェントを読み込めませんでした。",
      noAgents: "利用可能なエージェントがありません",
      modelLabel: "モデル",
      modelPlaceholder: "デフォルト",
      reasoningLabel: "推論",
      reasoningOptions: {
        default: "デフォルト",
        minimal: "最小",
        low: "低",
        medium: "中",
        high: "高",
      },
      worktreeTitle: "新しいワークツリーで実行",
      worktreeDescription: "このチャットを専用の git ワークツリーに隔離します",
      worktreeHint:
        "ワークツリーで実行するにはプロジェクトを選択してください。",
      error:
        "チャットを作成できませんでした。デーモン接続を確認して再試行してください。",
      create: "チャットを作成",
    },
    settings: {
      projects: {
        title: "プロジェクト",
        description:
          "プロジェクトを削除しても、デスクトップ上のファイルは削除されません。",
        empty: "プロジェクトはまだありません。",
        add: "プロジェクトを追加",
        createTitle: "プロジェクトを追加",
        editTitle: "プロジェクトを編集",
        formDescription:
          "デスクトップ上に存在するフォルダのパスを入力してください。",
        pathLabel: "プロジェクトのパス",
        pathPlaceholder: "/Users/you/project",
        editAction: "{{name}} を編集",
        deleteAction: "{{name}} を削除",
        deleteTitle: "{{name}} を削除しますか？",
        deleteWithoutChats:
          "Angel Engine からプロジェクトを削除します。ファイルはディスクに残ります。",
        deleteWithChats:
          "プロジェクトと関連する {{count}} 件のチャットを削除します。ファイルはディスクに残ります。",
        loadError: "プロジェクトを読み込めませんでした。",
        saveError: "プロジェクトを保存できませんでした。",
        deleteError: "プロジェクトを削除できませんでした。",
      },
      customAgents: {
        title: "カスタムエージェント",
        description:
          "エージェントはデスクトップに保存されます。環境変数はローカルに平文で保存されます。",
        empty: "カスタムエージェントはまだありません。",
        add: "エージェントを追加",
        createTitle: "カスタムエージェントを追加",
        editTitle: "カスタムエージェントを編集",
        formDescription:
          "デスクトップ上で実行する ACP 互換コマンドを設定します。",
        nameLabel: "名前",
        commandLabel: "コマンド",
        commandPlaceholder: "my-agent",
        argsLabel: "引数（1 行に 1 つ）",
        argsPlaceholder: "acp\n--stdio",
        environmentLabel: "環境変数（1 行に 1 つの NAME=value）",
        environmentPlaceholder: "API_KEY=value",
        needAuth: "認証が必要",
        autoAuthenticate: "自動的に認証",
        editAction: "{{name}} を編集",
        deleteAction: "{{name}} を削除",
        deleteTitle: "{{name}} を削除しますか？",
        deleteWithoutChats:
          "Angel Engine からカスタムエージェントを削除します。",
        deleteWithChats:
          "カスタムエージェントと、それを使用する {{count}} 件のチャットを削除します。",
        loadError: "カスタムエージェントを読み込めませんでした。",
        saveError: "カスタムエージェントを保存できませんでした。",
        deleteError: "カスタムエージェントを削除できませんでした。",
      },
      appearance: {
        title: "外観",
        theme: "テーマ",
        themeDescription: "このデバイスでのアプリの外観を選択します。",
        themeOptions: {
          system: "システム",
          light: "ライト",
          dark: "ダーク",
        },
        language: "言語",
        languageDescription: "このデバイスで使用する言語を選択します。",
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
        title: "情報",
        description:
          "これらの設定はこのデバイスにのみ適用され、デスクトップアプリの構成とは別に保持されます。",
        appName: "Angel Engine Mobile",
        appDescription:
          "Angel Engine デスクトップアプリのモバイルコンパニオン。",
      },
    },
  },
} satisfies LocaleResource;
