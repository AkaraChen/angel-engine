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
      showLess: "折りたたむ",
      showMore: "もっと見る",
    },
    login: {
      title: "Angel Engine のロック解除",
      description:
        "このデバイスを接続するには、デスクトップアプリで設定したペアリングパスワードを入力してください。",
      passwordLabel: "パスワード",
      passwordPlaceholder: "ペアリングパスワード",
      passwordHelp: "パスワードは大文字と小文字を区別します。",
      showPassword: "パスワードを表示",
      hidePassword: "パスワードを隠す",
      incorrectPassword:
        "パスワードが正しくありません。もう一度お試しください。",
      connectionError:
        "デスクトップアプリに接続できませんでした。接続を確認して再試行してください。",
      recoveryHint:
        "新しいペアリングパスワードが必要な場合は、デスクトップの設定 → モバイル表示でリセットしてから、ここに戻ってください。",
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
      navigationTitle: "ナビゲーション",
      navigationDescription: "Angel Engine の主な移動先。",
      close: "ナビゲーションを閉じる",
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
      activityErrorTitle: "アクティビティを読み込めませんでした",
      errorTitle: "チャットを読み込めませんでした",
      filterSegments: "チャットを絞り込む",
      segmentEmpty: "ここには何もありません。",
      segments: {
        all: "すべて",
        attention: "要対応",
        running: "実行中",
        done: "完了",
      },
    },
    activity: {
      status: {
        waitingForYou: "対応待ち",
        failed: "失敗",
        stuck: "停止",
        running: "実行中",
        done: "完了",
      },
    },
    chat: {
      thinking: "思考中…",
      turnFailed: "アシスタントのターンが失敗しました。",
      emptyTitle: "まだメッセージがありません",
      emptyDescription: "メッセージを送信して会話を始めましょう。",
      errorTitle: "このチャットを読み込めませんでした",
      runFailedTitle: "前回の実行が失敗しました",
      messagePlaceholder: "メッセージ",
      sendAria: "送信",
      stopAria: "停止",
      attachAria: "ファイルを添付",
      attachments: "添付ファイル",
      removeAttachment: "{{name}} を削除",
      retryAttachment: "{{name}} を再試行",
      roleUser: "あなた",
      roleAssistant: "アシスタント",
      sendFailed:
        "メッセージを送信できませんでした。下書きは残っています — もう一度お試しください。",
      attachmentErrors: {
        accept: "そのファイル形式はサポートされていません。",
        maxFileSize: "各ファイルは 10 MB 以下にしてください。",
        maxFiles: "添付できるファイルは 5 件までです。",
        fileRead:
          "ファイルを読み取れませんでした。再試行するか削除してください。",
      },
      plan: "プラン",
      todo: "Todo",
      build: "ビルド",
      switchToPlan: "プランモードに切り替え",
      switchToBuild: "ビルドモードに切り替え",
      planCreated: "{{title}} を作成",
      planUpdated: "{{title}} を更新",
      planProgress: "{{completed}}/{{total}}",
      couldNotChangeMode: "モードを変更できませんでした",
      attentionNeedsInput: "入力が必要",
      attentionNeedsInputDescription: "エージェントが返信を待っています。",
      attentionReview: "確認",
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
      promptRequired: "まずプロンプトを入力してください。",
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
      connection: {
        title: "接続",
        description:
          "このブラウザはローカルの Angel Engine デーモンとペアリングされています。切断すると、この端末のトークンのみが削除されます。",
        server: "ペアリング済みサーバー",
        sameOrigin: "このページのオリジン",
        status: "状態",
        statusOnline: "接続済み",
        statusConnecting: "接続中…",
        statusUnreachable: "到達不可",
        daemonVersion: "デーモンのバージョン",
        versionUnknown: "不明",
        disconnectSectionTitle: "このデバイス",
        disconnectDescription:
          "切断すると、このブラウザのペアリングトークンのみが削除されます。デスクトップのパスワードやチャットは変更されません。",
        disconnect: "このデバイスを切断",
        disconnectConfirmTitle: "このデバイスを切断しますか？",
        disconnectConfirmDescription:
          "再接続にはペアリングパスワードが必要です。チャットとデスクトップのパスワードは変わりません。",
        disconnectConfirm: "切断",
      },
      projects: {
        actionError:
          "プロジェクトの操作を完了できませんでした。再試行してください。",
        add: "プロジェクトを追加",
        createTitle: "プロジェクトを追加",
        deleteAria: "{{name}}を削除",
        deleteChecking: "関連チャットを確認しています…",
        deleteConflict:
          "このダイアログを開いてからプロジェクトが変更されました。最新の影響を確認してもう一度お試しください。",
        deleteImpact:
          "このプロジェクトを削除すると、関連する {{count}} 件のチャットも完全に削除されます。",
        deleteImpactOne:
          "このプロジェクトを削除すると、関連する 1 件のチャットも完全に削除されます。",
        deleteImpactUnknown:
          "このプロジェクトを削除すると、関連するチャットも完全に削除されます。",
        deleteNoChats: "このプロジェクトに関連するチャットはありません。",
        deleteTitle: "プロジェクトを削除しますか？",
        description:
          "プロジェクトは Angel Engine を実行しているコンピューター上のフォルダーを参照します。",
        editAria: "{{name}}を編集",
        editTitle: "プロジェクトを編集",
        empty: "プロジェクトはまだありません。",
        filesKept: "プロジェクトフォルダー内のファイルは保持されます。",
        formDescription:
          "Angel Engine を実行しているコンピューター上の絶対フォルダーパスを入力してください。",
        loadError: "プロジェクトを読み込めませんでした。",
        pathInvalid: "既存のフォルダーへのパスを入力してください。",
        pathLabel: "フォルダーのパス",
        pathPlaceholder: "/path/to/project",
        pathRequired: "フォルダパスを入力してください。",
        title: "プロジェクト",
      },
      customAgents: {
        actionError:
          "カスタムエージェントの操作を完了できませんでした。再試行してください。",
        add: "カスタムエージェントを追加",
        argsLabel: "引数",
        argsPlaceholder: "1 行に 1 つの引数",
        autoAuthenticateLabel: "自動的に認証",
        commandLabel: "コマンド",
        commandRequired: "コマンドを入力してください。",
        createTitle: "カスタムエージェントを追加",
        deleteAria: "{{name}}を削除",
        deleteChecking: "関連チャットを確認しています…",
        deleteImpact:
          "このエージェントを削除すると、関連する {{count}} 件のチャットも完全に削除されます。",
        deleteImpactOne:
          "このエージェントを削除すると、関連する 1 件のチャットも完全に削除されます。",
        deleteImpactUnknown:
          "このエージェントを削除すると、関連するチャットも完全に削除されます。",
        deleteNoChats: "このエージェントに関連するチャットはありません。",
        deleteTitle: "カスタムエージェントを削除しますか？",
        description: "軽量な ACP 互換エージェントコマンドを管理します。",
        editAria: "{{name}}を編集",
        editTitle: "カスタムエージェントを編集",
        empty: "カスタムエージェントはまだありません。",
        environmentHint: "環境変数の値はローカルに平文で保存されます。",
        environmentLabel: "環境変数",
        environmentPlaceholder: "NAME=value（1 行に 1 つ）",
        formDescription:
          "このエージェントの起動に使用するコマンドと任意の引数を設定します。",
        loadError: "カスタムエージェントを読み込めませんでした。",
        nameLabel: "名前",
        nameRequired: "名前を入力してください。",
        needAuthLabel: "認証が必要",
        title: "カスタムエージェント",
      },
      about: {
        appDescription:
          "Angel Engine デスクトップアプリのモバイルコンパニオン。",
        appName: "Angel Engine Mobile",
        build: "ビルド",
        copied: "コピーしました",
        copyDiagnostics: "診断情報をコピー",
        copyFailed: "コピーできませんでした。手動でコピーしてください。",
        description:
          "これらの設定はこのデバイスにのみ適用され、デスクトップアプリの構成とは別に保持されます。",
        diagnostics: "診断情報",
        title: "情報",
      },
    },
  },
} satisfies LocaleResource;
