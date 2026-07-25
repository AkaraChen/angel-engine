import type { LocaleResource } from "./schema";

export const ja = {
  translation: {
    app: {
      name: "Angel Engine",
    },
    common: {
      cancel: "キャンセル",
      delete: "削除",
      edit: "編集",
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
      projects: {
        actionError:
          "プロジェクトの操作を完了できませんでした。再試行してください。",
        add: "プロジェクトを追加",
        createTitle: "プロジェクトを追加",
        deleteChecking: "関連チャットを確認しています…",
        deleteImpact:
          "このプロジェクトを削除すると、関連する {{count}} 件のチャットも完全に削除されます。",
        deleteImpactUnknown:
          "このプロジェクトを削除すると、関連するチャットも完全に削除されます。",
        deleteTitle: "プロジェクトを削除しますか？",
        description:
          "プロジェクトは Angel Engine を実行しているコンピューター上のフォルダーを参照します。",
        editTitle: "プロジェクトを編集",
        empty: "プロジェクトはまだありません。",
        filesKept: "プロジェクトフォルダー内のファイルは保持されます。",
        formDescription:
          "Angel Engine を実行しているコンピューター上の絶対フォルダーパスを入力してください。",
        loadError: "プロジェクトを読み込めませんでした。",
        pathLabel: "フォルダーのパス",
        pathPlaceholder: "/path/to/project",
        title: "プロジェクト",
      },
      customAgents: {
        actionError:
          "カスタムエージェントの操作を完了できませんでした。再試行してください。",
        add: "カスタムエージェントを追加",
        argsLabel: "引数",
        argsPlaceholder: "1 行に 1 つの引数",
        commandLabel: "コマンド",
        createTitle: "カスタムエージェントを追加",
        deleteChecking: "関連チャットを確認しています…",
        deleteImpact:
          "このエージェントを削除すると、関連する {{count}} 件のチャットも完全に削除されます。",
        deleteImpactUnknown:
          "このエージェントを削除すると、関連するチャットも完全に削除されます。",
        deleteNoChats: "このエージェントに関連するチャットはありません。",
        deleteTitle: "カスタムエージェントを削除しますか？",
        description: "軽量な ACP 互換エージェントコマンドを管理します。",
        editTitle: "カスタムエージェントを編集",
        empty: "カスタムエージェントはまだありません。",
        environmentHint: "環境変数の値はローカルに平文で保存されます。",
        environmentLabel: "環境変数",
        environmentPlaceholder: "NAME=value（1 行に 1 つ）",
        formDescription:
          "このエージェントの起動に使用するコマンドと任意の引数を設定します。",
        loadError: "カスタムエージェントを読み込めませんでした。",
        nameLabel: "名前",
        title: "カスタムエージェント",
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
