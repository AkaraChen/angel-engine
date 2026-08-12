import type { LocaleResourceTranslationWorkspaceToolsPullRequest } from "./schema";

export const pullRequestEn = {
  archive: "Archive workspace",
  archiveDetail: "Archiving closes this chat and removes its managed worktree.",
  archiveFailed: "Could not archive workspace",
  archiveConfirmDetail:
    "This archives the chat and removes its managed worktree at {{path}}.",
  archiveConfirmDirtyDetail:
    "The worktree at {{path}} has uncommitted changes. Archiving removes it and permanently discards those changes.",
  archiveConfirmTitle: "Archive this workspace?",
  archiveUnavailable: "This workspace is not attached to a chat.",
  blocked: "Unable to merge",
  blockers: {
    behindBase_one: "The branch is {{count}} commit behind the base branch.",
    behindBase_other: "The branch is {{count}} commits behind the base branch.",
    changesRequested: "A reviewer requested changes.",
    checksFailed_one: "{{count}} required check failed: {{names}}.",
    checksFailed_other: "{{count}} required checks failed: {{names}}.",
    checksPending_one: "{{count}} required check is still running: {{names}}.",
    checksPending_other:
      "{{count}} required checks are still running: {{names}}.",
    conflict: "The pull request has merge conflicts.",
    draft: "The pull request is still a draft.",
    permissionDenied: "You do not have permission to merge this repository.",
    repositoryPolicy: "A repository rule is blocking this merge.",
    reviewRequired: "An approving review is required.",
    unresolvedThreads_one: "{{count}} review conversation is unresolved.",
    unresolvedThreads_other: "{{count}} review conversations are unresolved.",
  },
  checking: "Checking the pull request for this branch…",
  checkingMergeability: "GitHub is still calculating mergeability.",
  continue: "Continue working",
  deleteBranch: "Delete the remote branch after merging",
  description: "Description",
  errors: {
    cliMissing: "GitHub CLI is required",
    cliMissingDetail: "Install gh to merge pull requests inside Angel Engine.",
    fetch: "Pull request unavailable",
    fetchDetail:
      "GitHub could not be reached. Check the repository and try again.",
    permission: "Read-only GitHub access",
    permissionDetail:
      "Open the pull request in GitHub to ask a maintainer to merge it.",
    unauthenticated: "GitHub CLI is not signed in",
    unauthenticatedDetail: "Run gh auth login, then refresh this panel.",
  },
  generalComment: "General comment",
  merge: "Merge",
  mergeChanged: "The pull request changed before the merge completed.",
  mergeFailed: "Merge failed",
  merged: "Pull request #{{number}} merged",
  mergedDetail: "The pull request was merged successfully.",
  mergedMethod: "Merged with {{method}}.",
  merging: "Merging…",
  method: "Merge method",
  methodDisabled: "not enabled by repository",
  methods: {
    merge: "Create a merge commit",
    rebase: "Rebase and merge",
    squash: "Squash and merge",
  },
  noOpen: "No open pull request",
  noOpenDetail: "Push this branch and open a pull request to merge it here.",
  open: "Open on GitHub",
  optionalChecksFailed_one:
    "{{count}} optional check failed: {{names}}. It does not block merging.",
  optionalChecksFailed_other:
    "{{count}} optional checks failed: {{names}}. They do not block merging.",
  ready: "Ready to merge",
  refresh: "Refresh",
  resolve: "Mark resolved",
  shepherd: {
    actionFailed: "Shepherd action failed",
    hold: {
      ambiguous: "Shepherd is waiting until the ambiguous send is resolved.",
      queuedRun: "Shepherd is waiting for a queued message to finish.",
      waitingForYou: "Shepherd is waiting for your input before continuing.",
    },
    invalidUrl: "Could not parse the pull request URL.",
    noChat: "Open a workspace chat before starting shepherd.",
    queued: "Waiting for the current reply to finish, then shepherd continues.",
    resume: "Resume",
    resumeFailed: "Could not resume shepherd",
    rounds: "{{round}} / {{max}}",
    settled: {
      blocked: {
        detail:
          "No progress after repeated attempts. Take over or adjust the PR.",
        title: "Shepherd blocked",
      },
      budget: {
        detail:
          "The round budget was reached. Resume or raise the limit later.",
        title: "Round budget reached",
      },
      closed: {
        detail: "The pull request was merged or closed.",
        title: "Pull request closed",
      },
      green: {
        detail: "Required checks are green and review threads are clear.",
        title: "Ready to merge",
      },
      stopped: {
        detail: "Shepherd paused. Resume when you want it to take over again.",
        title: "Shepherd stopped",
      },
    },
    shepherdingStop: "Shepherding… (click to stop)",
    sourceCollapse: "Collapse shepherd source",
    sourceExpand: "Expand shepherd source",
    start: "Shepherd this PR",
    startFailed: "Could not start shepherd",
    started: "Shepherd started",
    stopped: "Shepherd stopped",
    title: "Shepherd",
    working: "Working…",
    yielded: "Shepherd paused — you took over the session.",
    yieldedDetail:
      "Resume when you want shepherd to continue watching this PR.",
  },
  title: "Pull request",
  unresolvedTitle: "Unresolved conversations ({{count}})",
} satisfies LocaleResourceTranslationWorkspaceToolsPullRequest;

export const pullRequestZhCN = {
  ...pullRequestEn,
  archive: "归档此工作区",
  archiveDetail: "归档会关闭此聊天并移除其受管 worktree。",
  archiveFailed: "无法归档工作区",
  archiveConfirmDetail: "这会归档聊天并移除位于 {{path}} 的受管 worktree。",
  archiveConfirmDirtyDetail:
    "位于 {{path}} 的 worktree 有未提交更改。归档会移除它并永久丢弃这些更改。",
  archiveConfirmTitle: "归档此工作区？",
  archiveUnavailable: "此工作区未关联聊天。",
  blocked: "暂时无法合并",
  blockers: {
    behindBase_one: "当前分支落后目标分支 {{count}} 个提交。",
    behindBase_other: "当前分支落后目标分支 {{count}} 个提交。",
    changesRequested: "审阅者已请求修改。",
    checksFailed_one: "{{count}} 项必需检查失败：{{names}}。",
    checksFailed_other: "{{count}} 项必需检查失败：{{names}}。",
    checksPending_one: "{{count}} 项必需检查仍在运行：{{names}}。",
    checksPending_other: "{{count}} 项必需检查仍在运行：{{names}}。",
    conflict: "此拉取请求存在合并冲突。",
    draft: "此拉取请求仍是草稿。",
    permissionDenied: "你没有合并此仓库的权限。",
    repositoryPolicy: "仓库规则阻止了此次合并。",
    reviewRequired: "仍需要批准审阅。",
    unresolvedThreads_one: "仍有 {{count}} 条审阅评论未解决。",
    unresolvedThreads_other: "仍有 {{count}} 条审阅评论未解决。",
  },
  checking: "正在检查当前分支的拉取请求…",
  checkingMergeability: "GitHub 仍在计算是否可合并。",
  continue: "继续在此工作",
  deleteBranch: "合并后删除远端分支",
  description: "描述",
  errors: {
    cliMissing: "需要 GitHub CLI",
    cliMissingDetail: "安装 gh 后即可在 Angel Engine 内合并拉取请求。",
    fetch: "拉取请求不可用",
    fetchDetail: "无法访问 GitHub，请检查仓库后重试。",
    permission: "GitHub 只读权限",
    permissionDetail: "请在 GitHub 打开此拉取请求并请维护者合并。",
    unauthenticated: "GitHub CLI 未登录",
    unauthenticatedDetail: "请运行 gh auth login，然后刷新此面板。",
  },
  generalComment: "一般评论",
  merge: "合并",
  mergeChanged: "合并完成前拉取请求状态已变化。",
  mergeFailed: "合并失败",
  merged: "已合并拉取请求 #{{number}}",
  mergedDetail: "拉取请求已成功合并。",
  mergedMethod: "已使用“{{method}}”合并。",
  merging: "合并中…",
  method: "合并方式",
  methodDisabled: "仓库未启用",
  methods: {
    merge: "创建合并提交",
    rebase: "变基并合并",
    squash: "压缩并合并",
  },
  noOpen: "没有开放的拉取请求",
  noOpenDetail: "推送此分支并创建拉取请求后，即可在此合并。",
  open: "在 GitHub 打开",
  optionalChecksFailed_one:
    "{{count}} 项非必需检查失败：{{names}}。它们不会阻止合并。",
  optionalChecksFailed_other:
    "{{count}} 项非必需检查失败：{{names}}。它们不会阻止合并。",
  ready: "可以合并",
  refresh: "刷新",
  resolve: "标记为已解决",
  shepherd: {
    actionFailed: "Shepherd 操作失败",
    hold: {
      ambiguous: "Shepherd 在等待歧义发送被解决。",
      queuedRun: "Shepherd 在等待队列中的消息完成。",
      waitingForYou: "Shepherd 在等待你的输入后再继续。",
    },
    invalidUrl: "无法解析拉取请求链接。",
    noChat: "请先打开工作区会话再启动 Shepherd。",
    queued: "等当前回复结束后继续。",
    resume: "恢复",
    resumeFailed: "无法恢复 Shepherd",
    rounds: "{{round}} / {{max}}",
    settled: {
      blocked: {
        detail: "连续尝试后仍无进展，请接管或调整 PR。",
        title: "Shepherd 已阻塞",
      },
      budget: {
        detail: "已达轮次上限。需要时可恢复或提高上限。",
        title: "轮次预算已用尽",
      },
      closed: {
        detail: "拉取请求已合并或关闭。",
        title: "拉取请求已关闭",
      },
      green: {
        detail: "必需检查已通过，审阅对话已清空。",
        title: "可以合并",
      },
      stopped: {
        detail: "Shepherd 已暂停。需要时再恢复盯盘。",
        title: "Shepherd 已停止",
      },
    },
    shepherdingStop: "Shepherding…（点击停止）",
    sourceCollapse: "收起来源卡片",
    sourceExpand: "展开来源卡片",
    start: "Shepherd this PR",
    startFailed: "无法启动 Shepherd",
    started: "已启动 Shepherd",
    stopped: "已停止 Shepherd",
    title: "Shepherd",
    working: "处理中…",
    yielded: "Shepherd paused — 你接管了会话。",
    yieldedDetail: "需要时点恢复，继续盯这个 PR。",
  },
  title: "拉取请求",
  unresolvedTitle: "未解决的评论（{{count}}）",
} satisfies LocaleResourceTranslationWorkspaceToolsPullRequest;

export const pullRequestZhTW = {
  ...pullRequestEn,
  archive: "封存此工作區",
  archiveDetail: "封存會關閉此聊天並移除其受管 worktree。",
  archiveFailed: "無法封存工作區",
  archiveConfirmDetail: "這會封存聊天並移除位於 {{path}} 的受管 worktree。",
  archiveConfirmDirtyDetail:
    "位於 {{path}} 的 worktree 有未提交的變更。封存會移除它並永久捨棄這些變更。",
  archiveConfirmTitle: "要封存此工作區嗎？",
  archiveUnavailable: "此工作區未連結聊天。",
  blocked: "暫時無法合併",
  blockers: {
    behindBase_one: "目前分支落後目標分支 {{count}} 個提交。",
    behindBase_other: "目前分支落後目標分支 {{count}} 個提交。",
    changesRequested: "審閱者已要求修改。",
    checksFailed_one: "{{count}} 項必要檢查失敗：{{names}}。",
    checksFailed_other: "{{count}} 項必要檢查失敗：{{names}}。",
    checksPending_one: "{{count}} 項必要檢查仍在執行：{{names}}。",
    checksPending_other: "{{count}} 項必要檢查仍在執行：{{names}}。",
    conflict: "此提取要求存在合併衝突。",
    draft: "此提取要求仍是草稿。",
    permissionDenied: "你沒有合併此儲存庫的權限。",
    repositoryPolicy: "儲存庫規則阻止了此次合併。",
    reviewRequired: "仍需要核准審閱。",
    unresolvedThreads_one: "仍有 {{count}} 則審閱留言未解決。",
    unresolvedThreads_other: "仍有 {{count}} 則審閱留言未解決。",
  },
  checking: "正在檢查目前分支的提取要求…",
  checkingMergeability: "GitHub 仍在計算是否可以合併。",
  continue: "繼續在此工作",
  deleteBranch: "合併後刪除遠端分支",
  errors: {
    cliMissing: "需要 GitHub CLI",
    cliMissingDetail: "安裝 gh 後即可在 Angel Engine 內合併提取要求。",
    fetch: "無法取得提取要求",
    fetchDetail: "無法存取 GitHub，請檢查儲存庫後再試一次。",
    permission: "GitHub 唯讀權限",
    permissionDetail: "請在 GitHub 開啟此提取要求，並請維護者合併。",
    unauthenticated: "GitHub CLI 尚未登入",
    unauthenticatedDetail: "請執行 gh auth login，然後重新整理此面板。",
  },
  generalComment: "一般留言",
  merge: "合併",
  mergeChanged: "合併完成前，提取要求的狀態已變更。",
  mergeFailed: "合併失敗",
  merged: "已合併提取要求 #{{number}}",
  mergedDetail: "提取要求已成功合併。",
  mergedMethod: "已使用「{{method}}」合併。",
  merging: "合併中…",
  method: "合併方式",
  methodDisabled: "儲存庫未啟用",
  methods: {
    merge: "建立合併提交",
    rebase: "變基並合併",
    squash: "壓縮並合併",
  },
  noOpen: "沒有開啟中的提取要求",
  noOpenDetail: "推送此分支並建立提取要求後，即可在此合併。",
  open: "在 GitHub 開啟",
  optionalChecksFailed_one:
    "{{count}} 項非必要檢查失敗：{{names}}。它們不會阻止合併。",
  optionalChecksFailed_other:
    "{{count}} 項非必要檢查失敗：{{names}}。它們不會阻止合併。",
  ready: "可以合併",
  refresh: "重新整理",
  resolve: "標記為已解決",
  shepherd: {
    actionFailed: "Shepherd 操作失敗",
    hold: {
      ambiguous: "Shepherd 正在等待歧義傳送被解決。",
      queuedRun: "Shepherd 正在等待佇列中的訊息完成。",
      waitingForYou: "Shepherd 正在等待你的輸入後再繼續。",
    },
    invalidUrl: "無法解析提取要求連結。",
    noChat: "請先開啟工作區對話再啟動 Shepherd。",
    queued: "等目前回覆結束後繼續。",
    resume: "恢復",
    resumeFailed: "無法恢復 Shepherd",
    rounds: "{{round}} / {{max}}",
    settled: {
      blocked: {
        detail: "連續嘗試後仍無進展，請接手或調整 PR。",
        title: "Shepherd 已阻塞",
      },
      budget: {
        detail: "已達輪次上限。需要時可恢復或提高上限。",
        title: "輪次預算已用盡",
      },
      closed: {
        detail: "提取要求已合併或關閉。",
        title: "提取要求已關閉",
      },
      green: {
        detail: "必要檢查已通過，審閱對話已清空。",
        title: "可以合併",
      },
      stopped: {
        detail: "Shepherd 已暫停。需要時再恢復盯盤。",
        title: "Shepherd 已停止",
      },
    },
    shepherdingStop: "Shepherding…（點擊停止）",
    sourceCollapse: "收起來源卡片",
    sourceExpand: "展開來源卡片",
    start: "Shepherd this PR",
    startFailed: "無法啟動 Shepherd",
    started: "已啟動 Shepherd",
    stopped: "已停止 Shepherd",
    title: "Shepherd",
    working: "處理中…",
    yielded: "Shepherd paused — 你接管了對話。",
    yieldedDetail: "需要時點恢復，繼續盯這個 PR。",
  },
  title: "提取要求",
  unresolvedTitle: "未解決的留言（{{count}}）",
} satisfies LocaleResourceTranslationWorkspaceToolsPullRequest;

export const pullRequestFr = {
  ...pullRequestEn,
  archive: "Archiver l’espace de travail",
  archiveDetail:
    "L’archivage ferme cette conversation et supprime son worktree géré.",
  archiveFailed: "Impossible d’archiver l’espace de travail",
  archiveConfirmDetail:
    "Cette action archive la conversation et supprime le worktree géré situé à {{path}}.",
  archiveConfirmDirtyDetail:
    "Le worktree situé à {{path}} contient des modifications non validées. L’archivage le supprime et abandonne définitivement ces modifications.",
  archiveConfirmTitle: "Archiver cet espace de travail ?",
  archiveUnavailable:
    "Cet espace de travail n’est associé à aucune conversation.",
  blocked: "Fusion impossible",
  blockers: {
    behindBase_one:
      "La branche a {{count}} commit de retard sur la branche cible.",
    behindBase_other:
      "La branche a {{count}} commits de retard sur la branche cible.",
    changesRequested:
      "Une personne chargée de la revue a demandé des modifications.",
    checksFailed_one: "{{count}} vérification requise a échoué : {{names}}.",
    checksFailed_other:
      "{{count}} vérifications requises ont échoué : {{names}}.",
    checksPending_one:
      "{{count}} vérification requise est toujours en cours : {{names}}.",
    checksPending_other:
      "{{count}} vérifications requises sont toujours en cours : {{names}}.",
    conflict: "La pull request présente des conflits de fusion.",
    draft: "La pull request est encore un brouillon.",
    permissionDenied: "Vous n’avez pas l’autorisation de fusionner ce dépôt.",
    repositoryPolicy: "Une règle du dépôt bloque cette fusion.",
    reviewRequired: "Une revue d’approbation est requise.",
    unresolvedThreads_one: "{{count}} conversation de revue n’est pas résolue.",
    unresolvedThreads_other:
      "{{count}} conversations de revue ne sont pas résolues.",
  },
  checking: "Recherche de la pull request associée à cette branche…",
  checkingMergeability: "GitHub calcule encore si la fusion est possible.",
  continue: "Continuer à travailler",
  deleteBranch: "Supprimer la branche distante après la fusion",
  description: "Description",
  errors: {
    cliMissing: "GitHub CLI est requis",
    cliMissingDetail:
      "Installez gh pour fusionner des pull requests dans Angel Engine.",
    fetch: "Pull request indisponible",
    fetchDetail: "GitHub est inaccessible. Vérifiez le dépôt et réessayez.",
    permission: "Accès GitHub en lecture seule",
    permissionDetail:
      "Ouvrez la pull request dans GitHub et demandez sa fusion à une personne responsable du dépôt.",
    unauthenticated: "GitHub CLI n’est pas connecté",
    unauthenticatedDetail:
      "Exécutez gh auth login, puis actualisez ce panneau.",
  },
  generalComment: "Commentaire général",
  merge: "Fusionner",
  mergeChanged: "La pull request a changé avant la fin de la fusion.",
  mergeFailed: "Échec de la fusion",
  merged: "Pull request nº {{number}} fusionnée",
  mergedDetail: "La pull request a été fusionnée.",
  mergedMethod: "Fusionnée avec la méthode {{method}}.",
  merging: "Fusion en cours…",
  method: "Méthode de fusion",
  methodDisabled: "non activée dans le dépôt",
  methods: {
    merge: "Créer un commit de fusion",
    rebase: "Rebaser et fusionner",
    squash: "Compresser et fusionner",
  },
  noOpen: "Aucune pull request ouverte",
  noOpenDetail:
    "Poussez cette branche et ouvrez une pull request pour la fusionner ici.",
  open: "Ouvrir sur GitHub",
  optionalChecksFailed_one:
    "{{count}} vérification facultative a échoué : {{names}}. Elle ne bloque pas la fusion.",
  optionalChecksFailed_other:
    "{{count}} vérifications facultatives ont échoué : {{names}}. Elles ne bloquent pas la fusion.",
  ready: "Prête à fusionner",
  refresh: "Actualiser",
  resolve: "Marquer comme résolue",
  shepherd: {
    actionFailed: "Échec de l’action Shepherd",
    hold: {
      ambiguous: "Shepherd attend que l’envoi ambigu soit résolu.",
      queuedRun: "Shepherd attend la fin d’un message en file d’attente.",
      waitingForYou: "Shepherd attend votre intervention avant de continuer.",
    },
    invalidUrl: "Impossible d’analyser l’URL de la pull request.",
    noChat:
      "Ouvrez une conversation d’espace de travail avant de lancer Shepherd.",
    queued: "Shepherd continuera une fois la réponse en cours terminée.",
    resume: "Reprendre",
    resumeFailed: "Impossible de reprendre Shepherd",
    rounds: "{{round}} / {{max}}",
    settled: {
      blocked: {
        detail:
          "Aucune progression après plusieurs tentatives. Prenez la main ou modifiez la PR.",
        title: "Shepherd est bloqué",
      },
      budget: {
        detail:
          "La limite de tours a été atteinte. Reprenez ou augmentez-la ultérieurement.",
        title: "Limite de tours atteinte",
      },
      closed: {
        detail: "La pull request a été fusionnée ou fermée.",
        title: "Pull request fermée",
      },
      green: {
        detail:
          "Les vérifications requises sont au vert et les conversations de revue sont résolues.",
        title: "Prête à fusionner",
      },
      stopped: {
        detail:
          "Shepherd est en pause. Reprenez lorsque vous souhaitez lui redonner la main.",
        title: "Shepherd arrêté",
      },
    },
    shepherdingStop: "Shepherd en cours… (cliquer pour arrêter)",
    sourceCollapse: "Réduire la source de Shepherd",
    sourceExpand: "Développer la source de Shepherd",
    start: "Confier cette PR à Shepherd",
    startFailed: "Impossible de lancer Shepherd",
    started: "Shepherd démarré",
    stopped: "Shepherd arrêté",
    title: "Shepherd",
    working: "Traitement en cours…",
    yielded: "Shepherd est en pause — vous avez repris la session.",
    yieldedDetail:
      "Reprenez lorsque vous souhaitez que Shepherd surveille de nouveau cette PR.",
  },
  title: "Pull request",
  unresolvedTitle: "Conversations non résolues ({{count}})",
} satisfies LocaleResourceTranslationWorkspaceToolsPullRequest;

export const pullRequestDe = {
  ...pullRequestEn,
  archive: "Arbeitsbereich archivieren",
  archiveDetail:
    "Beim Archivieren wird dieser Chat geschlossen und der verwaltete Worktree entfernt.",
  archiveFailed: "Arbeitsbereich konnte nicht archiviert werden",
  archiveConfirmDetail:
    "Dadurch wird der Chat archiviert und der verwaltete Worktree unter {{path}} entfernt.",
  archiveConfirmDirtyDetail:
    "Der Worktree unter {{path}} enthält nicht committete Änderungen. Beim Archivieren wird er entfernt und diese Änderungen werden dauerhaft verworfen.",
  archiveConfirmTitle: "Diesen Arbeitsbereich archivieren?",
  archiveUnavailable: "Dieser Arbeitsbereich ist keinem Chat zugeordnet.",
  blocked: "Zusammenführen nicht möglich",
  blockers: {
    behindBase_one: "Der Branch liegt {{count}} Commit hinter dem Ziel-Branch.",
    behindBase_other:
      "Der Branch liegt {{count}} Commits hinter dem Ziel-Branch.",
    changesRequested: "Bei der Überprüfung wurden Änderungen angefordert.",
    checksFailed_one:
      "{{count}} erforderliche Prüfung fehlgeschlagen: {{names}}.",
    checksFailed_other:
      "{{count}} erforderliche Prüfungen fehlgeschlagen: {{names}}.",
    checksPending_one:
      "{{count}} erforderliche Prüfung wird noch ausgeführt: {{names}}.",
    checksPending_other:
      "{{count}} erforderliche Prüfungen werden noch ausgeführt: {{names}}.",
    conflict: "Der Pull Request enthält Merge-Konflikte.",
    draft: "Der Pull Request ist noch ein Entwurf.",
    permissionDenied: "Du darfst dieses Repository nicht zusammenführen.",
    repositoryPolicy: "Eine Repository-Regel blockiert diesen Merge.",
    reviewRequired: "Eine genehmigende Überprüfung ist erforderlich.",
    unresolvedThreads_one: "{{count}} Review-Unterhaltung ist noch offen.",
    unresolvedThreads_other: "{{count}} Review-Unterhaltungen sind noch offen.",
  },
  checking: "Pull Request für diesen Branch wird gesucht…",
  checkingMergeability: "GitHub berechnet noch, ob der Merge möglich ist.",
  continue: "Weiterarbeiten",
  deleteBranch: "Remote-Branch nach dem Merge löschen",
  description: "Beschreibung",
  errors: {
    cliMissing: "GitHub CLI ist erforderlich",
    cliMissingDetail:
      "Installiere gh, um Pull Requests in Angel Engine zusammenzuführen.",
    fetch: "Pull Request nicht verfügbar",
    fetchDetail:
      "GitHub ist nicht erreichbar. Prüfe das Repository und versuche es erneut.",
    permission: "Nur-Lese-Zugriff auf GitHub",
    permissionDetail:
      "Öffne den Pull Request in GitHub und bitte einen Maintainer um den Merge.",
    unauthenticated: "GitHub CLI ist nicht angemeldet",
    unauthenticatedDetail:
      "Führe gh auth login aus und aktualisiere dann dieses Panel.",
  },
  generalComment: "Allgemeiner Kommentar",
  merge: "Zusammenführen",
  mergeChanged: "Der Pull Request wurde vor Abschluss des Merges geändert.",
  mergeFailed: "Merge fehlgeschlagen",
  merged: "Pull Request Nr. {{number}} zusammengeführt",
  mergedDetail: "Der Pull Request wurde erfolgreich zusammengeführt.",
  mergedMethod: "Mit {{method}} zusammengeführt.",
  merging: "Wird zusammengeführt…",
  method: "Merge-Methode",
  methodDisabled: "im Repository nicht aktiviert",
  methods: {
    merge: "Merge-Commit erstellen",
    rebase: "Rebase und Merge",
    squash: "Squash und Merge",
  },
  noOpen: "Kein offener Pull Request",
  noOpenDetail:
    "Pushe diesen Branch und öffne einen Pull Request, um ihn hier zusammenzuführen.",
  open: "Auf GitHub öffnen",
  optionalChecksFailed_one:
    "{{count}} optionale Prüfung fehlgeschlagen: {{names}}. Sie blockiert den Merge nicht.",
  optionalChecksFailed_other:
    "{{count}} optionale Prüfungen fehlgeschlagen: {{names}}. Sie blockieren den Merge nicht.",
  ready: "Bereit zum Zusammenführen",
  refresh: "Aktualisieren",
  resolve: "Als gelöst markieren",
  shepherd: {
    actionFailed: "Shepherd-Aktion fehlgeschlagen",
    hold: {
      ambiguous: "Shepherd wartet, bis der mehrdeutige Versand geklärt ist.",
      queuedRun:
        "Shepherd wartet auf den Abschluss einer Nachricht in der Warteschlange.",
      waitingForYou: "Shepherd wartet vor dem Fortfahren auf deine Eingabe.",
    },
    invalidUrl: "Die Pull-Request-URL konnte nicht verarbeitet werden.",
    noChat: "Öffne einen Arbeitsbereich-Chat, bevor du Shepherd startest.",
    queued:
      "Shepherd fährt fort, sobald die aktuelle Antwort abgeschlossen ist.",
    resume: "Fortsetzen",
    resumeFailed: "Shepherd konnte nicht fortgesetzt werden",
    rounds: "{{round}} / {{max}}",
    settled: {
      blocked: {
        detail:
          "Nach mehreren Versuchen gibt es keinen Fortschritt. Übernimm oder passe den PR an.",
        title: "Shepherd blockiert",
      },
      budget: {
        detail:
          "Das Rundenlimit wurde erreicht. Setze später fort oder erhöhe das Limit.",
        title: "Rundenlimit erreicht",
      },
      closed: {
        detail: "Der Pull Request wurde zusammengeführt oder geschlossen.",
        title: "Pull Request geschlossen",
      },
      green: {
        detail:
          "Die erforderlichen Prüfungen sind grün und alle Review-Unterhaltungen sind geklärt.",
        title: "Bereit zum Zusammenführen",
      },
      stopped: {
        detail:
          "Shepherd ist pausiert. Setze fort, wenn Shepherd wieder übernehmen soll.",
        title: "Shepherd angehalten",
      },
    },
    shepherdingStop: "Shepherd arbeitet… (zum Anhalten klicken)",
    sourceCollapse: "Shepherd-Quelle einklappen",
    sourceExpand: "Shepherd-Quelle ausklappen",
    start: "Diesen PR mit Shepherd betreuen",
    startFailed: "Shepherd konnte nicht gestartet werden",
    started: "Shepherd gestartet",
    stopped: "Shepherd angehalten",
    title: "Shepherd",
    working: "In Arbeit…",
    yielded: "Shepherd pausiert — du hast die Sitzung übernommen.",
    yieldedDetail:
      "Setze fort, wenn Shepherd diesen PR wieder überwachen soll.",
  },
  title: "Pull Request",
  unresolvedTitle: "Offene Unterhaltungen ({{count}})",
} satisfies LocaleResourceTranslationWorkspaceToolsPullRequest;

export const pullRequestJa = {
  ...pullRequestEn,
  archive: "ワークスペースをアーカイブ",
  archiveDetail:
    "アーカイブすると、このチャットが閉じられ、管理対象の worktree が削除されます。",
  archiveFailed: "ワークスペースをアーカイブできませんでした",
  archiveConfirmDetail:
    "チャットをアーカイブし、{{path}} にある管理対象の worktree を削除します。",
  archiveConfirmDirtyDetail:
    "{{path}} の worktree に未コミットの変更があります。アーカイブすると worktree が削除され、変更は完全に破棄されます。",
  archiveConfirmTitle: "このワークスペースをアーカイブしますか？",
  archiveUnavailable: "このワークスペースはチャットに関連付けられていません。",
  blocked: "マージできません",
  blockers: {
    behindBase_one:
      "ブランチはベースブランチより {{count}} コミット遅れています。",
    behindBase_other:
      "ブランチはベースブランチより {{count}} コミット遅れています。",
    changesRequested: "レビュー担当者が変更をリクエストしました。",
    checksFailed_one: "必須チェック {{count}} 件が失敗しました：{{names}}。",
    checksFailed_other: "必須チェック {{count}} 件が失敗しました：{{names}}。",
    checksPending_one: "必須チェック {{count}} 件を実行中です：{{names}}。",
    checksPending_other: "必須チェック {{count}} 件を実行中です：{{names}}。",
    conflict: "プルリクエストにマージ競合があります。",
    draft: "プルリクエストはまだ下書きです。",
    permissionDenied: "このリポジトリをマージする権限がありません。",
    repositoryPolicy:
      "リポジトリのルールによってマージがブロックされています。",
    reviewRequired: "承認レビューが必要です。",
    unresolvedThreads_one: "未解決のレビュー会話が {{count}} 件あります。",
    unresolvedThreads_other: "未解決のレビュー会話が {{count}} 件あります。",
  },
  checking: "このブランチのプルリクエストを確認中…",
  checkingMergeability: "GitHub がマージ可能かどうかを計算しています。",
  continue: "作業を続ける",
  deleteBranch: "マージ後にリモートブランチを削除",
  description: "説明",
  errors: {
    cliMissing: "GitHub CLI が必要です",
    cliMissingDetail:
      "Angel Engine 内でプルリクエストをマージするには gh をインストールしてください。",
    fetch: "プルリクエストを利用できません",
    fetchDetail:
      "GitHub に接続できませんでした。リポジトリを確認して再試行してください。",
    permission: "GitHub は読み取り専用です",
    permissionDetail:
      "GitHub でプルリクエストを開き、メンテナーにマージを依頼してください。",
    unauthenticated: "GitHub CLI にサインインしていません",
    unauthenticatedDetail:
      "gh auth login を実行してから、このパネルを更新してください。",
  },
  generalComment: "全体へのコメント",
  merge: "マージ",
  mergeChanged: "マージの完了前にプルリクエストが変更されました。",
  mergeFailed: "マージに失敗しました",
  merged: "プルリクエスト #{{number}} をマージしました",
  mergedDetail: "プルリクエストを正常にマージしました。",
  mergedMethod: "{{method}} でマージしました。",
  merging: "マージ中…",
  method: "マージ方法",
  methodDisabled: "リポジトリで有効になっていません",
  methods: {
    merge: "マージコミットを作成",
    rebase: "リベースしてマージ",
    squash: "スカッシュしてマージ",
  },
  noOpen: "開いているプルリクエストはありません",
  noOpenDetail:
    "このブランチをプッシュしてプルリクエストを作成すると、ここでマージできます。",
  open: "GitHub で開く",
  optionalChecksFailed_one:
    "任意チェック {{count}} 件が失敗しました：{{names}}。マージはブロックされません。",
  optionalChecksFailed_other:
    "任意チェック {{count}} 件が失敗しました：{{names}}。マージはブロックされません。",
  ready: "マージできます",
  refresh: "更新",
  resolve: "解決済みにする",
  shepherd: {
    actionFailed: "Shepherd の操作に失敗しました",
    hold: {
      ambiguous: "Shepherd は曖昧な送信が解決されるまで待機しています。",
      queuedRun:
        "Shepherd はキュー内のメッセージが完了するまで待機しています。",
      waitingForYou: "Shepherd は続行する前に入力を待っています。",
    },
    invalidUrl: "プルリクエストの URL を解析できませんでした。",
    noChat: "Shepherd を開始する前にワークスペースのチャットを開いてください。",
    queued: "現在の返信が完了すると Shepherd が続行します。",
    resume: "再開",
    resumeFailed: "Shepherd を再開できませんでした",
    rounds: "{{round}} / {{max}}",
    settled: {
      blocked: {
        detail:
          "繰り返し試行しても進展がありません。引き継ぐか PR を調整してください。",
        title: "Shepherd がブロックされました",
      },
      budget: {
        detail:
          "ラウンド上限に達しました。後で再開するか上限を増やしてください。",
        title: "ラウンド上限に達しました",
      },
      closed: {
        detail: "プルリクエストはマージまたはクローズされました。",
        title: "プルリクエストはクローズ済みです",
      },
      green: {
        detail: "必須チェックが成功し、レビュー会話もすべて解決されています。",
        title: "マージできます",
      },
      stopped: {
        detail: "Shepherd は一時停止中です。再び任せるときに再開してください。",
        title: "Shepherd を停止しました",
      },
    },
    shepherdingStop: "Shepherd が対応中…（クリックして停止）",
    sourceCollapse: "Shepherd のソースを折りたたむ",
    sourceExpand: "Shepherd のソースを展開",
    start: "この PR を Shepherd に任せる",
    startFailed: "Shepherd を開始できませんでした",
    started: "Shepherd を開始しました",
    stopped: "Shepherd を停止しました",
    title: "Shepherd",
    working: "処理中…",
    yielded: "Shepherd は一時停止しました — セッションを引き継ぎました。",
    yieldedDetail:
      "Shepherd にこの PR の監視を続けさせる場合は再開してください。",
  },
  title: "プルリクエスト",
  unresolvedTitle: "未解決の会話（{{count}}）",
} satisfies LocaleResourceTranslationWorkspaceToolsPullRequest;

export const pullRequestKo = {
  ...pullRequestEn,
  archive: "작업 공간 보관",
  archiveDetail: "보관하면 이 채팅이 닫히고 관리되는 worktree가 제거됩니다.",
  archiveFailed: "작업 공간을 보관할 수 없습니다",
  archiveConfirmDetail:
    "채팅을 보관하고 {{path}}의 관리되는 worktree를 제거합니다.",
  archiveConfirmDirtyDetail:
    "{{path}}의 worktree에 커밋하지 않은 변경 사항이 있습니다. 보관하면 worktree가 제거되고 변경 사항이 영구적으로 삭제됩니다.",
  archiveConfirmTitle: "이 작업 공간을 보관할까요?",
  archiveUnavailable: "이 작업 공간은 채팅에 연결되어 있지 않습니다.",
  blocked: "병합할 수 없음",
  blockers: {
    behindBase_one:
      "브랜치가 기본 브랜치보다 {{count}}개 커밋 뒤처져 있습니다.",
    behindBase_other:
      "브랜치가 기본 브랜치보다 {{count}}개 커밋 뒤처져 있습니다.",
    changesRequested: "검토자가 변경을 요청했습니다.",
    checksFailed_one: "필수 검사 {{count}}개 실패: {{names}}.",
    checksFailed_other: "필수 검사 {{count}}개 실패: {{names}}.",
    checksPending_one: "필수 검사 {{count}}개 실행 중: {{names}}.",
    checksPending_other: "필수 검사 {{count}}개 실행 중: {{names}}.",
    conflict: "풀 리퀘스트에 병합 충돌이 있습니다.",
    draft: "풀 리퀘스트가 아직 초안입니다.",
    permissionDenied: "이 저장소를 병합할 권한이 없습니다.",
    repositoryPolicy: "저장소 규칙이 병합을 차단하고 있습니다.",
    reviewRequired: "승인 검토가 필요합니다.",
    unresolvedThreads_one: "해결되지 않은 검토 대화가 {{count}}개 있습니다.",
    unresolvedThreads_other: "해결되지 않은 검토 대화가 {{count}}개 있습니다.",
  },
  checking: "이 브랜치의 풀 리퀘스트 확인 중…",
  checkingMergeability: "GitHub에서 병합 가능 여부를 계산하고 있습니다.",
  continue: "계속 작업",
  deleteBranch: "병합 후 원격 브랜치 삭제",
  description: "설명",
  errors: {
    cliMissing: "GitHub CLI가 필요합니다",
    cliMissingDetail:
      "Angel Engine에서 풀 리퀘스트를 병합하려면 gh를 설치하세요.",
    fetch: "풀 리퀘스트를 사용할 수 없음",
    fetchDetail:
      "GitHub에 연결할 수 없습니다. 저장소를 확인하고 다시 시도하세요.",
    permission: "GitHub 읽기 전용 액세스",
    permissionDetail:
      "GitHub에서 풀 리퀘스트를 열고 관리자에게 병합을 요청하세요.",
    unauthenticated: "GitHub CLI에 로그인하지 않았습니다",
    unauthenticatedDetail: "gh auth login을 실행한 후 이 패널을 새로 고치세요.",
  },
  generalComment: "일반 댓글",
  merge: "병합",
  mergeChanged: "병합이 완료되기 전에 풀 리퀘스트가 변경되었습니다.",
  mergeFailed: "병합 실패",
  merged: "풀 리퀘스트 #{{number}} 병합됨",
  mergedDetail: "풀 리퀘스트가 성공적으로 병합되었습니다.",
  mergedMethod: "{{method}} 방식으로 병합되었습니다.",
  merging: "병합 중…",
  method: "병합 방식",
  methodDisabled: "저장소에서 활성화되지 않음",
  methods: {
    merge: "병합 커밋 만들기",
    rebase: "리베이스 후 병합",
    squash: "스쿼시 후 병합",
  },
  noOpen: "열린 풀 리퀘스트 없음",
  noOpenDetail:
    "이 브랜치를 푸시하고 풀 리퀘스트를 만들면 여기에서 병합할 수 있습니다.",
  open: "GitHub에서 열기",
  optionalChecksFailed_one:
    "선택 검사 {{count}}개 실패: {{names}}. 병합은 차단되지 않습니다.",
  optionalChecksFailed_other:
    "선택 검사 {{count}}개 실패: {{names}}. 병합은 차단되지 않습니다.",
  ready: "병합 준비 완료",
  refresh: "새로 고침",
  resolve: "해결됨으로 표시",
  shepherd: {
    actionFailed: "Shepherd 작업 실패",
    hold: {
      ambiguous: "Shepherd가 모호한 전송이 해결될 때까지 기다리고 있습니다.",
      queuedRun: "Shepherd가 대기열 메시지가 완료될 때까지 기다리고 있습니다.",
      waitingForYou: "Shepherd가 계속하기 전에 입력을 기다리고 있습니다.",
    },
    invalidUrl: "풀 리퀘스트 URL을 분석할 수 없습니다.",
    noChat: "Shepherd를 시작하기 전에 작업 공간 채팅을 여세요.",
    queued: "현재 응답이 끝나면 Shepherd가 계속 진행합니다.",
    resume: "다시 시작",
    resumeFailed: "Shepherd를 다시 시작할 수 없습니다",
    rounds: "{{round}} / {{max}}",
    settled: {
      blocked: {
        detail:
          "반복해서 시도했지만 진전이 없습니다. 직접 처리하거나 PR을 조정하세요.",
        title: "Shepherd 차단됨",
      },
      budget: {
        detail:
          "라운드 한도에 도달했습니다. 나중에 다시 시작하거나 한도를 늘리세요.",
        title: "라운드 한도 도달",
      },
      closed: {
        detail: "풀 리퀘스트가 병합되었거나 닫혔습니다.",
        title: "풀 리퀘스트 닫힘",
      },
      green: {
        detail: "필수 검사가 통과했고 검토 대화가 모두 해결되었습니다.",
        title: "병합 준비 완료",
      },
      stopped: {
        detail: "Shepherd가 일시 중지되었습니다. 다시 맡기려면 재개하세요.",
        title: "Shepherd 중지됨",
      },
    },
    shepherdingStop: "Shepherd 작업 중… (클릭하여 중지)",
    sourceCollapse: "Shepherd 소스 접기",
    sourceExpand: "Shepherd 소스 펼치기",
    start: "Shepherd에게 이 PR 맡기기",
    startFailed: "Shepherd를 시작할 수 없습니다",
    started: "Shepherd 시작됨",
    stopped: "Shepherd 중지됨",
    title: "Shepherd",
    working: "작업 중…",
    yielded: "Shepherd 일시 중지 — 세션을 직접 처리하고 있습니다.",
    yieldedDetail: "Shepherd가 이 PR을 다시 감시하게 하려면 재개하세요.",
  },
  title: "풀 리퀘스트",
  unresolvedTitle: "해결되지 않은 대화 ({{count}})",
} satisfies LocaleResourceTranslationWorkspaceToolsPullRequest;

export const pullRequestEs = {
  ...pullRequestEn,
  archive: "Archivar espacio de trabajo",
  archiveDetail:
    "Al archivar se cierra este chat y se elimina su worktree administrado.",
  archiveFailed: "No se pudo archivar el espacio de trabajo",
  archiveConfirmDetail:
    "Esta acción archiva el chat y elimina el worktree administrado de {{path}}.",
  archiveConfirmDirtyDetail:
    "El worktree de {{path}} tiene cambios sin confirmar. Al archivarlo se eliminará y esos cambios se descartarán permanentemente.",
  archiveConfirmTitle: "¿Archivar este espacio de trabajo?",
  archiveUnavailable: "Este espacio de trabajo no está vinculado a un chat.",
  blocked: "No se puede fusionar",
  blockers: {
    behindBase_one: "La rama está {{count}} commit por detrás de la rama base.",
    behindBase_other:
      "La rama está {{count}} commits por detrás de la rama base.",
    changesRequested: "Una persona revisora solicitó cambios.",
    checksFailed_one: "Falló {{count}} comprobación obligatoria: {{names}}.",
    checksFailed_other:
      "Fallaron {{count}} comprobaciones obligatorias: {{names}}.",
    checksPending_one:
      "{{count}} comprobación obligatoria sigue en ejecución: {{names}}.",
    checksPending_other:
      "{{count}} comprobaciones obligatorias siguen en ejecución: {{names}}.",
    conflict: "La pull request tiene conflictos de fusión.",
    draft: "La pull request todavía es un borrador.",
    permissionDenied: "No tienes permiso para fusionar este repositorio.",
    repositoryPolicy: "Una regla del repositorio bloquea esta fusión.",
    reviewRequired: "Se necesita una revisión aprobatoria.",
    unresolvedThreads_one:
      "Hay {{count}} conversación de revisión sin resolver.",
    unresolvedThreads_other:
      "Hay {{count}} conversaciones de revisión sin resolver.",
  },
  checking: "Comprobando la pull request de esta rama…",
  checkingMergeability: "GitHub todavía está calculando si se puede fusionar.",
  continue: "Seguir trabajando",
  deleteBranch: "Eliminar la rama remota después de fusionar",
  description: "Descripción",
  errors: {
    cliMissing: "Se necesita GitHub CLI",
    cliMissingDetail:
      "Instala gh para fusionar pull requests dentro de Angel Engine.",
    fetch: "Pull request no disponible",
    fetchDetail:
      "No se pudo acceder a GitHub. Comprueba el repositorio e inténtalo de nuevo.",
    permission: "Acceso de solo lectura a GitHub",
    permissionDetail:
      "Abre la pull request en GitHub y pide a una persona responsable que la fusione.",
    unauthenticated: "GitHub CLI no ha iniciado sesión",
    unauthenticatedDetail:
      "Ejecuta gh auth login y después actualiza este panel.",
  },
  generalComment: "Comentario general",
  merge: "Fusionar",
  mergeChanged: "La pull request cambió antes de que terminara la fusión.",
  mergeFailed: "Error al fusionar",
  merged: "Pull request n.º {{number}} fusionada",
  mergedDetail: "La pull request se fusionó correctamente.",
  mergedMethod: "Fusionada mediante {{method}}.",
  merging: "Fusionando…",
  method: "Método de fusión",
  methodDisabled: "no habilitado en el repositorio",
  methods: {
    merge: "Crear un commit de fusión",
    rebase: "Rebase y fusión",
    squash: "Squash y fusión",
  },
  noOpen: "No hay ninguna pull request abierta",
  noOpenDetail: "Sube esta rama y abre una pull request para fusionarla aquí.",
  open: "Abrir en GitHub",
  optionalChecksFailed_one:
    "Falló {{count}} comprobación opcional: {{names}}. No bloquea la fusión.",
  optionalChecksFailed_other:
    "Fallaron {{count}} comprobaciones opcionales: {{names}}. No bloquean la fusión.",
  ready: "Lista para fusionar",
  refresh: "Actualizar",
  resolve: "Marcar como resuelta",
  shepherd: {
    actionFailed: "Error en la acción de Shepherd",
    hold: {
      ambiguous: "Shepherd espera a que se resuelva el envío ambiguo.",
      queuedRun: "Shepherd espera a que termine un mensaje en cola.",
      waitingForYou: "Shepherd espera tu intervención antes de continuar.",
    },
    invalidUrl: "No se pudo interpretar la URL de la pull request.",
    noChat: "Abre un chat del espacio de trabajo antes de iniciar Shepherd.",
    queued: "Shepherd continuará cuando termine la respuesta actual.",
    resume: "Reanudar",
    resumeFailed: "No se pudo reanudar Shepherd",
    rounds: "{{round}} / {{max}}",
    settled: {
      blocked: {
        detail:
          "No hubo avances tras varios intentos. Toma el control o ajusta la PR.",
        title: "Shepherd está bloqueado",
      },
      budget: {
        detail:
          "Se alcanzó el límite de rondas. Reanuda o amplía el límite más adelante.",
        title: "Límite de rondas alcanzado",
      },
      closed: {
        detail: "La pull request se fusionó o cerró.",
        title: "Pull request cerrada",
      },
      green: {
        detail:
          "Las comprobaciones obligatorias están correctas y las conversaciones de revisión están resueltas.",
        title: "Lista para fusionar",
      },
      stopped: {
        detail:
          "Shepherd está en pausa. Reanúdalo cuando quieras que vuelva a encargarse.",
        title: "Shepherd detenido",
      },
    },
    shepherdingStop: "Shepherd trabajando… (haz clic para detener)",
    sourceCollapse: "Contraer la fuente de Shepherd",
    sourceExpand: "Expandir la fuente de Shepherd",
    start: "Encargar esta PR a Shepherd",
    startFailed: "No se pudo iniciar Shepherd",
    started: "Shepherd iniciado",
    stopped: "Shepherd detenido",
    title: "Shepherd",
    working: "Trabajando…",
    yielded: "Shepherd está en pausa: has tomado el control de la sesión.",
    yieldedDetail:
      "Reanúdalo cuando quieras que Shepherd vuelva a supervisar esta PR.",
  },
  title: "Pull request",
  unresolvedTitle: "Conversaciones sin resolver ({{count}})",
} satisfies LocaleResourceTranslationWorkspaceToolsPullRequest;
