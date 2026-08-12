export interface LocaleResourceTranslationApp {
  name: string;
}

export interface LocaleResourceTranslationMenu {
  view: string;
  window: string;
}

export interface LocaleResourceTranslationCommon {
  allow: string;
  allowSession: string;
  answered: string;
  attachment: string;
  backendUnavailable: string;
  desktopOperationFailed: string;
  build: string;
  bypassPermission: string;
  cancel: string;
  cancelled: string;
  close: string;
  completed: string;
  copy: string;
  delete: string;
  declined: string;
  default: string;
  deny: string;
  draft: string;
  edit: string;
  error: string;
  failed: string;
  file: string;
  helpful: string;
  image: string;
  loading: string;
  loadMore: string;
  mention: string;
  notHelpful: string;
  other: string;
  pending: string;
  pin: string;
  plan: string;
  proposed: string;
  question: string;
  reload: string;
  retry: string;
  running: string;
  save: string;
  saving: string;
  search: string;
  searching: string;
  send: string;
  showLess: string;
  showMore: string;
  speak: string;
  stopSpeaking: string;
  submit: string;
  submitting: string;
  thinking: string;
  todo: string;
  unpin: string;
  updated: string;
  useDefault: string;
  rename: string;
}

export interface LocaleResourceTranslationAttachment {
  open: string;
}

export interface LocaleResourceTranslationWorkspaceToolsCommit {
  committing: string;
  commitTo: string;
  descriptionPlaceholder: string;
  filesSelected: string;
  summaryPlaceholder: string;
}

export interface LocaleResourceTranslationWorkspaceToolsGitPushHint {
  auth: string;
  detached: string;
  network: string;
  noCommits: string;
  noRemote: string;
  rejected: string;
}

export interface LocaleResourceTranslationWorkspaceToolsGit {
  ahead: string;
  behind: string;
  changes: string;
  clean: string;
  conflicts: string;
  currentBranch: string;
  detached: string;
  dirty: string;
  history: string;
  noBranches: string;
  noCommits: string;
  noHistory: string;
  noCommitsToPropose: string;
  noUpstream: string;
  publish: string;
  pull: string;
  pullCount: string;
  pulling: string;
  push: string;
  pushCount: string;
  pushHint: LocaleResourceTranslationWorkspaceToolsGitPushHint;
  pushing: string;
  viewTabs: string;
}

export interface LocaleResourceTranslationWorkspaceToolsDiffBase {
  branch: string;
  fallback: {
    anchorMissing: string;
    anchorUnavailable: string;
    defaultBranchUnavailable: string;
    gitRefUnavailable: string;
    noMergeBase: string;
    notRepository: string;
  };
  fileCount: string;
  label: string;
  session: string;
  turn: string;
  unstaged: string;
  worktree: string;
}

export interface LocaleResourceTranslationWorkspaceToolsPullRequestPreview {
  additions: string;
  body: string;
  commits: string;
  copied: string;
  copyLink: string;
  deletions: string;
  description: string;
  emptyBody: string;
  filesChanged: string;
  loadFailed: string;
  open: string;
  title: string;
}

export interface LocaleResourceTranslationWorkspaceToolsCreatePullRequest {
  ahead: string;
  base: string;
  bodyPlaceholder: string;
  create: string;
  created: string;
  creating: string;
  description: string;
  existing: string;
  noCommits: string;
  openInBrowser: string;
  pushedRetry: string;
  pushing: string;
  preview: LocaleResourceTranslationWorkspaceToolsPullRequestPreview;
  retry: string;
  short: string;
  title: string;
  titlePlaceholder: string;
  view: string;
  viewShort: string;
  willPushMany: string;
  willPushOne: string;
}

export interface LocaleResourceTranslationWorkspaceToolsEmpty {
  checksUnavailable: string;
  fileTreeUnavailable: string;
  fileUnavailable: string;
  gitUnavailable: string;
  noChanges: string;
  noChecks: string;
  noDiffForFile: string;
  noProcesses: string;
  noPullRequest: string;
  noPullRequestDetail: string;
  noWorkspace: string;
  notGitRepository: string;
  processesUnavailable: string;
}

export interface LocaleResourceTranslationWorkspaceToolsTabs {
  checks: string;
  files: string;
  gitChanges: string;
  newTab: string;
  pullRequest: string;
  processes: string;
  tabs: string;
  tools: string;
  workspaceTabs: string;
}

export interface LocaleResourceTranslationWorkspaceToolsChecks {
  fixFailures: string;
  fixNeedsChat: string;
  fixStarted: string;
  fixing: string;
  openCheck: string;
  openPullRequest: string;
  refresh: string;
  summaryFail: string;
  summaryPass: string;
  summaryPending: string;
}

export interface LocaleResourceTranslationWorkspaceToolsCommentsStatus {
  open: string;
  pending: string;
  resolved: string;
}

export interface LocaleResourceTranslationWorkspaceToolsComments {
  delete: string;
  lineComment: string;
  needsBody: string;
  placeholder: string;
  reopen: string;
  resolve: string;
  select: string;
  sending: string;
  sendToAgent: string;
  sideNew: string;
  sideOld: string;
  status: LocaleResourceTranslationWorkspaceToolsCommentsStatus;
  title: string;
}

export interface LocaleResourceTranslationWorkspaceToolsPullRequest {
  archive: string;
  archiveDetail: string;
  archiveFailed: string;
  archiveConfirmDetail: string;
  archiveConfirmDirtyDetail: string;
  archiveConfirmTitle: string;
  archiveUnavailable: string;
  blocked: string;
  blockers: {
    behindBase_one: string;
    behindBase_other: string;
    changesRequested: string;
    checksFailed_one: string;
    checksFailed_other: string;
    checksPending_one: string;
    checksPending_other: string;
    conflict: string;
    draft: string;
    permissionDenied: string;
    repositoryPolicy: string;
    reviewRequired: string;
    unresolvedThreads_one: string;
    unresolvedThreads_other: string;
  };
  checking: string;
  checkingMergeability: string;
  continue: string;
  deleteBranch: string;
  description: string;
  errors: {
    cliMissing: string;
    cliMissingDetail: string;
    fetch: string;
    fetchDetail: string;
    permission: string;
    permissionDetail: string;
    unauthenticated: string;
    unauthenticatedDetail: string;
  };
  generalComment: string;
  merge: string;
  mergeChanged: string;
  mergeFailed: string;
  merged: string;
  mergedDetail: string;
  mergedMethod: string;
  merging: string;
  method: string;
  methodDisabled: string;
  methods: { merge: string; rebase: string; squash: string };
  noOpen: string;
  noOpenDetail: string;
  open: string;
  optionalChecksFailed_one: string;
  optionalChecksFailed_other: string;
  ready: string;
  refresh: string;
  resolve: string;
  shepherd: {
    actionFailed: string;
    hold: {
      ambiguous: string;
      queuedRun: string;
      waitingForYou: string;
    };
    invalidUrl: string;
    noChat: string;
    queued: string;
    resume: string;
    resumeFailed: string;
    rounds: string;
    settled: {
      blocked: { detail: string; title: string };
      budget: { detail: string; title: string };
      closed: { detail: string; title: string };
      green: { detail: string; title: string };
      stopped: { detail: string; title: string };
    };
    shepherdingStop: string;
    sourceCollapse: string;
    sourceExpand: string;
    start: string;
    startFailed: string;
    started: string;
    stopped: string;
    title: string;
    working: string;
    yielded: string;
    yieldedDetail: string;
  };
  title: string;
  unresolvedTitle: string;
}

export interface LocaleResourceTranslationWorkspaceTools {
  addToChat: string;
  browser: string;
  checks: LocaleResourceTranslationWorkspaceToolsChecks;
  comments: LocaleResourceTranslationWorkspaceToolsComments;
  commit: LocaleResourceTranslationWorkspaceToolsCommit;
  diffBase: LocaleResourceTranslationWorkspaceToolsDiffBase;
  createPullRequest: LocaleResourceTranslationWorkspaceToolsCreatePullRequest;
  dockInSidebar: string;
  empty: LocaleResourceTranslationWorkspaceToolsEmpty;
  git: LocaleResourceTranslationWorkspaceToolsGit;
  listeningPorts: string;
  pullRequest: LocaleResourceTranslationWorkspaceToolsPullRequest;
  resizeFileTree: string;
  resizeGitList: string;
  subprocesses: string;
  terminal: string;
  unavailable: string;
  diffUnavailable: string;
  openInWindow: string;
  tabs: LocaleResourceTranslationWorkspaceToolsTabs;
}

export interface LocaleResourceTranslationWorkspaceBrowser {
  back: string;
  forward: string;
  urlLabel: string;
}

export interface LocaleResourceTranslationWorkspaceFiles {
  fileUnavailable: string;
  openFiles: string;
  selectFile: string;
}

export interface LocaleResourceTranslationWorkspaceProcesses {
  actions: string;
  address: string;
  command: string;
  emptyDetail: string;
  kill: string;
  name: string;
  port: string;
  process: string;
  service: string;
}

export interface LocaleResourceTranslationWorkspaceRightSidebar {
  focus: string;
  hide: string;
  resize: string;
  show: string;
  toggle: string;
}

export interface LocaleResourceTranslationWorkspaceSetup {
  approvalUnavailable: string;
  continueAnyway: string;
  discard: string;
  discardConfirm: string;
  discardConfirmDescription: string;
  discardConfirmTitle: string;
  failedStep: string;
  failedTitle: string;
  noLog: string;
  ready: string;
  retry: string;
  running: string;
  runningStep: string;
  viewLog: string;
}

export interface LocaleResourceTranslationWorkspaceAmbiguousSend {
  description: string;
  dismiss: string;
  title: string;
}

export interface LocaleResourceTranslationWorkspace {
  ambiguousSend: LocaleResourceTranslationWorkspaceAmbiguousSend;
  browser: LocaleResourceTranslationWorkspaceBrowser;
  files: LocaleResourceTranslationWorkspaceFiles;
  backgroundChatCompleted: string;
  backgroundChatNeedsInput: string;
  backgroundChatStatus: string;
  closeTab: string;
  creationLocationProject: string;
  creationLocationSelect: string;
  creationLocationWorktree: string;
  newChat: string;
  newChatInProject: string;
  noProject: string;
  projectSelect: string;
  processes: LocaleResourceTranslationWorkspaceProcesses;
  rightSidebar: LocaleResourceTranslationWorkspaceRightSidebar;
  settings: string;
  setup: LocaleResourceTranslationWorkspaceSetup;
  statsBranch: string;
  statsChanges: string;
  statsLastActive: string;
  tools: LocaleResourceTranslationWorkspaceTools;
  title: string;
  worktreeDirtyContinue: string;
  worktreeDirtyDescription: string;
  worktreeDirtyRemember: string;
  worktreeDirtyTitle: string;
  worktreeNotGitRepository: string;
  worktreeSetupCommands: string;
  worktreeSetupContinue: string;
  worktreeSetupDescription: string;
  worktreeSetupDirtyWarning: string;
  worktreeSetupTitle: string;
  worktreeSetupConfigure: string;
  worktreeSetupDismiss: string;
  worktreeSetupLegacyDescription: string;
  worktreeSetupMigrate: string;
  worktreeSetupMigrationDone: string;
  worktreeSetupMissingDescription: string;
  worktreeSetupMissingTitle: string;
}

export interface LocaleResourceTranslationSidebarDateGroups {
  dayBeforeYesterday: string;
  older: string;
  pinned: string;
  previousMonth: string;
  previousWeek: string;
  today: string;
  yesterday: string;
}

export interface LocaleResourceTranslationFleetGroups {
  attention: string;
  done: string;
  running: string;
}

export interface LocaleResourceTranslationFleetEmptySegments {
  all: string;
  attention: string;
  done: string;
  running: string;
}

export interface LocaleResourceTranslationFleetReasons {
  approval: string;
  processExited: string;
  question: string;
  runtimeError: string;
}

export interface LocaleResourceTranslationFleetSegments {
  all: string;
  attention: string;
  done: string;
  running: string;
}

export interface LocaleResourceTranslationFleetStatus {
  done: string;
  failed: string;
  running: string;
  stuck: string;
  waitingForYou: string;
}

export interface LocaleResourceTranslationFleetViews {
  board: string;
  list: string;
}

export interface LocaleResourceTranslationFleet {
  allProjects: string;
  disconnected: string;
  emptySegments: LocaleResourceTranslationFleetEmptySegments;
  filterProject: string;
  filterSegments: string;
  groups: LocaleResourceTranslationFleetGroups;
  loading: string;
  noMatches: string;
  reasons: LocaleResourceTranslationFleetReasons;
  search: string;
  segments: LocaleResourceTranslationFleetSegments;
  standaloneProject: string;
  status: LocaleResourceTranslationFleetStatus;
  title: string;
  viewMode: string;
  views: LocaleResourceTranslationFleetViews;
}

export interface LocaleResourceTranslationSchedule {
  agent: string;
  alreadyRunning: string;
  createAction: string;
  createDescription: string;
  createTitle: string;
  currentAgent: string;
  customCron: string;
  deleteConfirm: string;
  discardConfirm: string;
  disconnected: string;
  invalidCron: string;
  name: string;
  newAutomation: string;
  nextThreeRuns: string;
  noProject: string;
  notifyOnFailure: string;
  pause: string;
  paused: string;
  project: string;
  prompt: string;
  recipes: {
    ciHeartbeat: string;
    ciHeartbeatDescription: string;
    dependencyAudit: string;
    dependencyAuditDescription: string;
    nightlyTests: string;
    nightlyTestsDescription: string;
    title: string;
  };
  resume: string;
  runNow: string;
  runStatus: {
    cancelled: string;
    failed: string;
    missed: string;
    running: string;
    succeeded: string;
  };
  schedule: string;
  schedulePresets: {
    custom: string;
    daily: string;
    "every-30-minutes": string;
    hourly: string;
    weekdays: string;
    weekly: string;
  };
  startFromScratch: string;
  status: {
    active: string;
    failing: string;
    paused: string;
    running: string;
  };
  subtitle: string;
  title: string;
  triggerType: {
    manual: string;
    scheduled: string;
  };
}

export interface LocaleResourceTranslationSidebar {
  addProject: string;
  archiveChat: string;
  chatAttention: string;
  chats: string;
  completed: string;
  dateGroups: LocaleResourceTranslationSidebarDateGroups;
  loadingChats: string;
  loadingProjects: string;
  modeChat: string;
  modePower: string;
  modeSwitcher: string;
  modeWork: string;
  needsInput: string;
  newChat: string;
  newChatInProject: string;
  noChats: string;
  noProjects: string;
  noStandaloneChats: string;
  openBranchChat: string;
  projects: string;
  projectsLoadError: string;
  powerWorktreeHome: string;
  powerWorktreeHistoricalChat: string;
  refreshProjects: string;
  retryWorktreeCreation: string;
  settings: string;
  shepherding: string;
  toggleChats: string;
  mobileDescription: string;
  title: string;
  toggleSidebar: string;
  worktreeMain: string;
  worktreeCreating: string;
  worktreeCreationFailed: string;
}

export interface LocaleResourceTranslationSettingsAgents {
  enabledLabel: string;
  minimumEnabled: string;
  title: string;
}

export interface LocaleResourceTranslationSettingsArchivedRemovableWorktrees {
  confirmDeleteDetail: string;
  confirmDeleteTitle: string;
  deleteFailed: string;
  deletingToast: string;
  deleteWorktree: string;
  deletedToast: string;
  empty: string;
  missingOnDisk: string;
  noSessions: string;
  partialFailure: string;
  scanAgain: string;
  sessionCount_one: string;
  sessionCount_other: string;
  title: string;
}

export interface LocaleResourceTranslationSettingsArchived {
  allProjects: string;
  bulkSelect: string;
  clearSelection: string;
  confirmDeleteDetail: string;
  confirmDeleteTitle: string;
  confirmDeleteWorktreeDetail: string;
  deletedToast: string;
  deletePermanently: string;
  deleteSelected: string;
  done: string;
  empty: string;
  filterProject: string;
  filterTime: string;
  noProject: string;
  removableWorktrees: LocaleResourceTranslationSettingsArchivedRemovableWorktrees;
  restore: string;
  restoredToast: string;
  restoreSelected: string;
  selectAll: string;
  selectedCount: string;
  sessionsTitle: string;
  timeAll: string;
  timeLast7Days: string;
  timeLast30Days: string;
  timeLast90Days: string;
  timeToday: string;
  worktree: string;
}

export interface LocaleResourceTranslationSettingsAppearanceLanguageOptions {
  en: string;
  "zh-CN": string;
  "zh-TW": string;
  fr: string;
  de: string;
  ko: string;
  ja: string;
  es: string;
}

export interface LocaleResourceTranslationSettingsAppearanceThemeOptions {
  dark: string;
  light: string;
  system: string;
}

export interface LocaleResourceTranslationSettingsAppearance {
  keybindingHintsDescription: string;
  keybindingHintsSwitchLabel: string;
  keybindingHintsTitle: string;
  language: string;
  languageOptions: LocaleResourceTranslationSettingsAppearanceLanguageOptions;
  theme: string;
  themeOptions: LocaleResourceTranslationSettingsAppearanceThemeOptions;
}

export interface LocaleResourceTranslationSettingsDanger {
  confirmDeleteAll: string;
  deleteAction: string;
  deleting: string;
  deleteTitle: string;
  description: string;
  title: string;
}

export interface LocaleResourceTranslationSettingsTabs {
  agents: string;
  appearance: string;
  archived: string;
  danger: string;
  keyboard: string;
  mobile: string;
  updates: string;
  workspace: string;
  usage: string;
}

export interface LocaleResourceTranslationSettingsTabDescriptions {
  agents: string;
  appearance: string;
  archived: string;
  danger: string;
  keyboard: string;
  mobile: string;
  updates: string;
  workspace: string;
  usage: string;
}

export interface LocaleResourceTranslationUsageUnavailableReasons {
  "binary-missing": string;
  "exec-failed": string;
  "schema-mismatch": string;
  timeout: string;
}

export interface LocaleResourceTranslationUsage {
  activeBlock: string;
  activeRuns: string;
  burnRate: string;
  burnRateThreshold: string;
  burnRateWarning: string;
  burnRateWarningActive: string;
  burnRateWarningDescription: string;
  byAgent: string;
  cacheCreationTokens: string;
  cacheReadTokens: string;
  collecting: string;
  contextNearLimit: string;
  contextUsed: string;
  month: string;
  noData: string;
  projected: string;
  inputTokens: string;
  lastCollected: string;
  outputTokens: string;
  refresh: string;
  source: string;
  sourceDescription: string;
  sessionCost: string;
  today: string;
  tokens: string;
  unavailable: string;
  unavailableReasons: LocaleResourceTranslationUsageUnavailableReasons;
  warnings: string;
  week: string;
}

export interface LocaleResourceTranslationSettingsUpdates {
  betaDescription: string;
  betaSwitchLabel: string;
  betaTitle: string;
  checkButton: string;
  checkTitle: string;
  currentVersionTitle: string;
  description: string;
  downloadIndeterminate: string;
  downloadIndeterminateWithSpeed: string;
  downloadProgress: string;
  downloadProgressWithSpeed: string;
  downloadStarting: string;
  installButton: string;
  stateChecking: string;
  stateDownloaded: string;
  stateDownloading: string;
  stateError: string;
  stateIdleDetail: string;
  stateInstalling: string;
  stateUnchecked: string;
  stateUpToDate: string;
  unsupported: string;
}

export interface LocaleResourceTranslationSettingsGroups {
  connectivity: string;
  data: string;
  general: string;
}

export interface LocaleResourceTranslationSettingsMobile {
  copied: string;
  copy: string;
  enabledDescription: string;
  enabledTitle: string;
  hostDescription: string;
  hostTitle: string;
  passwordDescription: string;
  passwordDialogDescription: string;
  passwordDialogTitle: string;
  passwordReset: string;
  passwordSet: string;
  passwordTitle: string;
  portDescription: string;
  portTitle: string;
  qrCode: string;
  qrDialogDescription: string;
  qrDialogTitle: string;
  urlDisabled: string;
  urlNeedsPassword: string;
  urlOpen: string;
  urlPending: string;
  urlTitle: string;
}

export interface LocaleResourceTranslationSettingsKeyboard {
  addShortcut: string;
  bindEscape: string;
  conflictAmbiguous: string;
  conflictChordPrefix: string;
  conflictShadowed: string;
  emptySearch: string;
  filterAll: string;
  filterConflicts: string;
  filterModified: string;
  hintsLink: string;
  loadFailedDescription: string;
  loadFailedTitle: string;
  openConfig: string;
  recordingChordThen: string;
  recordingHint: string;
  remove: string;
  resetAll: string;
  resetAllConfirm: string;
  resetBroken: string;
  resetCategory: string;
  resetCommand: string;
  searchPlaceholder: string;
  sourceConflict: string;
  sourceDefault: string;
  sourceUser: string;
  sourceUserOverride: string;
  warningsCount: string;
}

export interface LocaleResourceTranslationCommandsCategories {
  app: string;
  chat: string;
  files: string;
  view: string;
}

export interface LocaleResourceTranslationCommands {
  categories: LocaleResourceTranslationCommandsCategories;
  chatFocusComposer: string;
  chatInterrupt: string;
  chatNew: string;
  chatNewline: string;
  chatRemoveLastAttachment: string;
  chatSend: string;
  filesSave: string;
  paletteClose: string;
  paletteOpen: string;
  settingsClose: string;
  settingsOpen: string;
  workspaceCloseTab: string;
  workspaceNewTab: string;
  workspaceNextTab: string;
  workspacePreviousTab: string;
  workspaceToggleSidebar: string;
}

export interface LocaleResourceTranslationSettingsWorkspace {
  dirtyPromptDescription: string;
  dirtyPromptSwitchLabel: string;
  dirtyPromptTitle: string;
  osNotificationsDescription: string;
  osNotificationsSwitchLabel: string;
  osNotificationsTitle: string;
  sendWithModEnterDescription: string;
  sendWithModEnterSwitchLabel: string;
  sendWithModEnterTitle: string;
  trayEnabledDescription: string;
  trayEnabledSwitchLabel: string;
  trayEnabledTitle: string;
}

export interface LocaleResourceTranslationTray {
  disable: string;
  empty: string;
  needsYouCount: string;
  openApp: string;
  tooltip: string;
  tooltipNeedsYou: string;
}

export interface LocaleResourceTranslationSettingsLinear {
  apiConnection: string;
  connect: string;
  connected: string;
  connectFailed: string;
  description: string;
  disconnect: string;
  disconnectFailed: string;
  notConnected: string;
  replaceToken: string;
  title: string;
  tokenLabel: string;
  tokenPlaceholder: string;
}

export interface LocaleResourceTranslationSettingsCustomAgentsForm {
  args: string;
  autoAuthenticate: string;
  command: string;
  environment: string;
  name: string;
  requiresAuth: string;
}

export interface LocaleResourceTranslationSettingsCustomAgents {
  addAgent: string;
  deleteAgent: string;
  editAgent: string;
  enableAgent: string;
  form: LocaleResourceTranslationSettingsCustomAgentsForm;
  plainTextNotice: string;
  title: string;
}

export interface LocaleResourceTranslationSettings {
  agents: LocaleResourceTranslationSettingsAgents;
  appearance: LocaleResourceTranslationSettingsAppearance;
  archived: LocaleResourceTranslationSettingsArchived;
  customAgents: LocaleResourceTranslationSettingsCustomAgents;
  danger: LocaleResourceTranslationSettingsDanger;
  description: string;
  groups: LocaleResourceTranslationSettingsGroups;
  keyboard: LocaleResourceTranslationSettingsKeyboard;
  linear: LocaleResourceTranslationSettingsLinear;
  mobile: LocaleResourceTranslationSettingsMobile;
  tabDescriptions: LocaleResourceTranslationSettingsTabDescriptions;
  tabs: LocaleResourceTranslationSettingsTabs;
  title: string;
  updates: LocaleResourceTranslationSettingsUpdates;
  workspace: LocaleResourceTranslationSettingsWorkspace;
}

export interface LocaleResourceTranslationUpdates {
  checkFailed: string;
  checkFailedDetail: string;
  checkForUpdates: string;
  checking: string;
  checkingDetail: string;
  devPreviewNotes: string;
  devPreviewVersion: string;
  downloaded: string;
  downloadedDetail: string;
  restartAndInstall: string;
  title: string;
  unsupportedPlatform: string;
  unsupportedPlatformDetail: string;
  upToDate: string;
  upToDateDetail: string;
}

export interface LocaleResourceTranslationThreadEmpty {
  description: string;
  recentEmpty: string;
  recentShowAll: string;
  recentShowLess: string;
  recentTitle: string;
  suggestionClarify: string;
  suggestionExplore: string;
  suggestionFix: string;
  suggestionSummarize: string;
  suggestionTests: string;
  suggestionWrite: string;
  title: string;
  titleWithProject: string;
}

export interface LocaleResourceTranslationThread {
  empty: LocaleResourceTranslationThreadEmpty;
  quote: string;
  restoring: string;
}

export interface LocaleResourceTranslationComposerAttachmentErrors {
  accept: string;
  fileRead: string;
  maxFileSize: string;
  maxFiles: string;
  submit: string;
}

export interface LocaleResourceTranslationComposerDisabledReasons {
  agentCannotChangeAfterStart: string;
  agentCannotChangeWhileRunning: string;
  cannotAdjust: string;
  cannotChangeWhileRunning: string;
  onlyOneAgent: string;
  onlyOneValue: string;
}

export interface LocaleResourceTranslationComposerSettingLabels {
  agentMode: string;
  permissionMode: string;
  reasoningEffort: string;
}

export interface LocaleResourceTranslationComposerToasts {
  couldNotChangeMode: string;
  couldNotReadFile: string;
  couldNotSearchFiles: string;
  couldNotSendMessage: string;
  tooManyFiles: string;
}

export interface LocaleResourceTranslationComposerGitHubErrors {
  cliMissing: string;
  cliUnauthenticated: string;
  fetchFailed: string;
  notFound: string;
  urlUnsupported: string;
}

export interface LocaleResourceTranslationComposerTaskLinkErrors {
  linearFetchFailed: string;
  linearNotFound: string;
  linearUnauthorized: string;
  prForkUnsupported: string;
  unsupported: string;
}

export interface LocaleResourceTranslationComposer {
  agentMode: string;
  agentSettings: string;
  attachFiles: string;
  attachGitHub: string;
  attachGitHubConfirm: string;
  attachGitHubEmpty: string;
  attachGitHubLoading: string;
  attachGitHubPlaceholder: string;
  attachGitHubTitle: string;
  attachGitHubUpdated: string;
  attachmentErrors: LocaleResourceTranslationComposerAttachmentErrors;
  commands: string;
  couldNotReadAttachment: string;
  disabledReasons: LocaleResourceTranslationComposerDisabledReasons;
  effort: string;
  fileTypeBlocked: string;
  fileTooLarge: string;
  files: string;
  fromLink: string;
  fromLinkPlaceholder: string;
  githubErrors: LocaleResourceTranslationComposerGitHubErrors;
  githubIssue: string;
  githubPullRequest: string;
  linearConnectAction: string;
  linearConnectDescription: string;
  linearIssue: string;
  linearItemMeta: string;
  loadingCommands: string;
  loadingSkills: string;
  loadingValue: string;
  mode: string;
  model: string;
  noCommandsAdvertised: string;
  noFilesFound: string;
  noMatchingCommands: string;
  noMatchingSkills: string;
  noModelsFound: string;
  noSkillsAdvertised: string;
  pasteSource: string;
  permissionMode: string;
  placeholder: string;
  plan: string;
  previewUnavailable: string;
  provider: string;
  removeAttachment: string;
  removePasteSource: string;
  searchModels: string;
  settingLabels: LocaleResourceTranslationComposerSettingLabels;
  skills: string;
  switchToBuild: string;
  switchToPlan: string;
  taskLinkErrors: LocaleResourceTranslationComposerTaskLinkErrors;
  taskLinkHintComplete: string;
  taskLinkHintGitHubPath: string;
  taskLinkHintLinearPath: string;
  taskLinkHintSupported: string;
  taskLinkStateClosed: string;
  taskLinkStateMerged: string;
  taskLinkStateOpen: string;
  terminalSelection: string;
  toasts: LocaleResourceTranslationComposerToasts;
}

export interface LocaleResourceTranslationComponentsToolGroup {
  activity: string;
  approvals_one: string;
  approvals_other: string;
  toolCalls_one: string;
  toolCalls_other: string;
}

export interface LocaleResourceTranslationComponents {
  reasoning: string;
  toolGroup: LocaleResourceTranslationComponentsToolGroup;
}

export interface LocaleResourceTranslationMessagesElicitation {
  awaitingAnswer: string;
  awaitingDecision: string;
  dynamicTool: string;
  externalFlow: string;
  permissionProfile: string;
  userInput: string;
}

export interface LocaleResourceTranslationMessagesToasts {
  couldNotForkSession: string;
  couldNotHandoffPlan: string;
  couldNotStartImplementation: string;
}

export interface LocaleResourceTranslationMessagesToolPhase {
  awaitingDecision: string;
  streamingResult: string;
}

export interface LocaleResourceTranslationMessagesTool {
  input: string;
  output: string;
  phase: LocaleResourceTranslationMessagesToolPhase;
}

export interface LocaleResourceTranslationMessages {
  completedCount: string;
  created: string;
  elicitation: LocaleResourceTranslationMessagesElicitation;
  exportMarkdown: string;
  forkSession: string;
  handoff: string;
  handoffMenuLabel: string;
  handoffPromptIntro: string;
  handoffPromptPlanFile: string;
  planMarker: string;
  response: string;
  startImplementation: string;
  toasts: LocaleResourceTranslationMessagesToasts;
  tool: LocaleResourceTranslationMessagesTool;
}

export interface LocaleResourceTranslationDialog {
  chatName: string;
  confirm: LocaleResourceTranslationDialogConfirm;
  importSession: LocaleResourceTranslationDialogImportSession;
  renameChat: string;
  sessionHandoff: LocaleResourceTranslationDialogSessionHandoff;
}

export interface LocaleResourceTranslationDialogConfirm {
  deleteCustomAgentDetail_one: string;
  deleteCustomAgentDetail_other: string;
  deleteCustomAgentDetailNone: string;
  deleteCustomAgentTitle: string;
  discard: string;
  dontSave: string;
  kill: string;
  killProcessTitle: string;
  saveFileChangesDetail: string;
  saveFileChangesTitle: string;
}

export interface LocaleResourceTranslationDialogImportSession {
  allAgents: string;
  clearSelection: string;
  description: string;
  empty: string;
  emptyDetail: string;
  importAction: string;
  importFailed: string;
  importing: string;
  noMatches: string;
  noMatchesDetail: string;
  retryAction: string;
  searchPlaceholder: string;
  titleForProject: string;
}

export interface LocaleResourceTranslationDialogSessionHandoff {
  contextPackLabel: string;
  description: string;
  dirtyDescription: string;
  dirtyTitle: string;
  keyFilesCount: string;
  loadFailed: string;
  loadingContext: string;
  notesLabel: string;
  notesPlaceholder: string;
  otherAgentsSection: string;
  sameAgentHint: string;
  sameAgentSection: string;
  sameAgentUnavailable: string;
  submitFailed: string;
  title: string;
  titleFrom: string;
  titleUntitled: string;
}

export interface LocaleResourceTranslationNotifications {
  agentFailedNoDetail: string;
  agentFinishedNoOutput: string;
  agentWaiting: string;
  centerClear: string;
  centerEmpty: string;
  centerOpenChat: string;
  centerTitle: string;
  centerUnread: string;
  chatActionFailed: string;
  chatArchived: string;
  chatArchivedDescription: string;
  chatsDeleted: string;
  chatsDeletedDescription_one: string;
  chatsDeletedDescription_other: string;
  couldNotAddProject: string;
  couldNotChangeAgent: string;
  couldNotCreateChat: string;
  couldNotDeleteChats: string;
  couldNotLoadProjects: string;
  couldNotRenameChat: string;
  failed: string;
  finished: string;
  installUpdate: string;
  needsAttention: string;
  needsInput: string;
  permissionRequired: string;
  projectActionFailed: string;
  undo: string;
  updateReady: string;
  updateReadyDescription: string;
}

export interface LocaleResourceTranslationProjectImport {
  readyTitle: string;
  addFromFolder: string;
  addFromGit: string;
  archivedBadge: string;
  clone: string;
  cloneTo: string;
  description: string;
  failedTitle: string;
  forkBadge: string;
  loadingOwners: string;
  loadingRepositories: string;
  noMatches: string;
  noOwners: string;
  noRepositories: string;
  openProject: string;
  owners: string;
  ownersFailed: string;
  privateBadge: string;
  progressTitle: string;
  repositoriesFailed: string;
  retry: string;
  reusedExisting: string;
  searchPlaceholder: string;
  stageCloning: string;
  stageCompleted: string;
  stagePreparing: string;
  stageRegistering: string;
  tabGitHub: string;
  tabUrl: string;
  title: string;
  urlHint: string;
  urlLabel: string;
  urlPlaceholder: string;
}

export interface LocaleResourceTranslationProjects {
  chooseFolder: string;
  importSession: string;
  openInFinder: string;
  scriptShell: string;
  scriptShellAuto: string;
  scriptShellBash: string;
  scriptShellSystem: string;
  settings: string;
  settingsLoadFailed: string;
  settingsSaveFailed: string;
  settingsSaved: string;
  settingsTitle: string;
  setupScript: string;
  setupScriptPlaceholder: string;
}

export interface LocaleResourceTranslationPathLauncher {
  copyPath: string;
  openInAngelTerminal: string;
  openInEditor: string;
  openInFileExplorer: string;
  openInFileManager: string;
  openInFinder: string;
  openInSystemTerminal: string;
}

export interface LocaleResourceTranslationUi {
  commandActions: string;
  commandDescription: string;
  commandNewWorkspace: string;
  commandNoResults: string;
  commandPalette: string;
  commandSessions: string;
  commandImportSession: string;
  commandShepherdPr: string;
}

export interface LocaleResourceTranslationPromptInput {
  addPhotosOrFiles: string;
  placeholder: string;
  takeScreenshot: string;
  uploadFiles: string;
}

export interface LocaleResourceTranslationRuntimeValuesMode {
  acceptEdits: string;
  agent: string;
  architect: string;
  ask: string;
  build: string;
  bypassPermissions: string;
  chat: string;
  code: string;
  default: string;
  edit: string;
  plan: string;
  yolo: string;
}

export interface LocaleResourceTranslationRuntimeValuesPermissionMode {
  acceptEdits: string;
  allowAll: string;
  always: string;
  auto: string;
  autoEdit: string;
  bypassPermissions: string;
  default: string;
  dontAsk: string;
  never: string;
  onFailure: string;
  onRequest: string;
  plan: string;
  readOnly: string;
  untrusted: string;
  yolo: string;
}

export interface LocaleResourceTranslationRuntimeValuesReasoningEffort {
  high: string;
  low: string;
  medium: string;
  minimal: string;
  none: string;
  xhigh: string;
}

export interface LocaleResourceTranslationRuntimeValues {
  mode: LocaleResourceTranslationRuntimeValuesMode;
  permissionMode: LocaleResourceTranslationRuntimeValuesPermissionMode;
  reasoningEffort: LocaleResourceTranslationRuntimeValuesReasoningEffort;
}

export interface LocaleResourceTranslation {
  commands: LocaleResourceTranslationCommands;
  app: LocaleResourceTranslationApp;
  menu: LocaleResourceTranslationMenu;
  common: LocaleResourceTranslationCommon;
  attachment: LocaleResourceTranslationAttachment;
  workspace: LocaleResourceTranslationWorkspace;
  fleet: LocaleResourceTranslationFleet;
  schedule: LocaleResourceTranslationSchedule;
  sidebar: LocaleResourceTranslationSidebar;
  settings: LocaleResourceTranslationSettings;
  updates: LocaleResourceTranslationUpdates;
  thread: LocaleResourceTranslationThread;
  composer: LocaleResourceTranslationComposer;
  components: LocaleResourceTranslationComponents;
  messages: LocaleResourceTranslationMessages;
  dialog: LocaleResourceTranslationDialog;
  notifications: LocaleResourceTranslationNotifications;
  pathLauncher: LocaleResourceTranslationPathLauncher;
  projectImport: LocaleResourceTranslationProjectImport;
  projects: LocaleResourceTranslationProjects;
  tray: LocaleResourceTranslationTray;
  ui: LocaleResourceTranslationUi;
  promptInput: LocaleResourceTranslationPromptInput;
  runtimeValues: LocaleResourceTranslationRuntimeValues;
  usage?: LocaleResourceTranslationUsage;
}

export interface LocaleResource {
  translation: LocaleResourceTranslation;
}
