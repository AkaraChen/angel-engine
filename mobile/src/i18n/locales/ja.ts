import type { LocaleResource } from "./schema";

export const ja = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "キャンセル",
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
    },
    elicitation: {
      defaultTitle: "エージェントが入力を求めています",
      allow: "許可",
      allowForSession: "セッション中は許可",
      deny: "拒否",
      dismiss: "閉じる",
    },
    createChat: {
      description:
        "プロジェクトまたはワークツリーでエージェントセッションを開始します。",
      promptLabel: "最初のプロンプト",
      promptPlaceholder: "エージェントに何をさせますか？",
      projectLabel: "プロジェクト",
      noProject: "プロジェクトなし（アドホック）",
      agentLabel: "エージェント",
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
