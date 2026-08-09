export interface LocaleResourceTranslationApp {
  name: string;
}

export interface LocaleResourceTranslationCommon {
  allow: string;
  allowSession: string;
  answered: string;
  attachment: string;
  backendUnavailable: string;
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
  mention: string;
  notHelpful: string;
  other: string;
  pending: string;
  pin: string;
  plan: string;
  proposed: string;
  question: string;
  reload: string;
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

export interface LocaleResourceTranslationWorkspaceToolsEmpty {
  fileTreeUnavailable: string;
  fileUnavailable: string;
  gitUnavailable: string;
  noChanges: string;
  noDiffForFile: string;
  noProcesses: string;
  noWorkspace: string;
  notGitRepository: string;
  processesUnavailable: string;
}

export interface LocaleResourceTranslationWorkspaceToolsTabs {
  files: string;
  gitChanges: string;
  newTab: string;
  processes: string;
  tabs: string;
  tools: string;
  workspaceTabs: string;
}

export interface LocaleResourceTranslationWorkspaceTools {
  commit: LocaleResourceTranslationWorkspaceToolsCommit;
  dockInSidebar: string;
  empty: LocaleResourceTranslationWorkspaceToolsEmpty;
  listeningPorts: string;
  resizeFileTree: string;
  resizeGitList: string;
  subprocesses: string;
  tabs: LocaleResourceTranslationWorkspaceToolsTabs;
}

export interface LocaleResourceTranslationWorkspace {
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
  settings: string;
  statsBranch: string;
  statsChanges: string;
  statsLastActive: string;
  tools: LocaleResourceTranslationWorkspaceTools;
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
  importSession: string;
  newChat: string;
  newChatInProject: string;
  noChats: string;
  noProjects: string;
  noStandaloneChats: string;
  projects: string;
  powerWorktreeHome: string;
  powerWorktreeHistoricalChat: string;
  refreshProjects: string;
  settings: string;
  toggleChats: string;
  mobileDescription: string;
  title: string;
  toggleSidebar: string;
  worktreeMain: string;
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
  mobile: string;
  updates: string;
  workspace: string;
}

export interface LocaleResourceTranslationSettingsTabDescriptions {
  agents: string;
  appearance: string;
  archived: string;
  danger: string;
  mobile: string;
  updates: string;
  workspace: string;
}

export interface LocaleResourceTranslationSettingsUpdates {
  betaDescription: string;
  betaSwitchLabel: string;
  betaTitle: string;
  checkButton: string;
  checkTitle: string;
  currentVersionTitle: string;
  description: string;
  installButton: string;
  stateChecking: string;
  stateDownloaded: string;
  stateDownloading: string;
  stateError: string;
  stateIdle: string;
  stateUnchecked: string;
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

export interface LocaleResourceTranslationSettingsWorkspace {
  dirtyPromptDescription: string;
  dirtyPromptSwitchLabel: string;
  dirtyPromptTitle: string;
  sendWithModEnterDescription: string;
  sendWithModEnterSwitchLabel: string;
  sendWithModEnterTitle: string;
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
  githubErrors: LocaleResourceTranslationComposerGitHubErrors;
  githubIssue: string;
  githubPullRequest: string;
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
  importSession: LocaleResourceTranslationDialogImportSession;
  renameChat: string;
}

export interface LocaleResourceTranslationDialogImportSession {
  cwdLabel: string;
  description: string;
  empty: string;
  importAction: string;
  importFailed: string;
  importing: string;
  runtimeLabel: string;
  runtimeRequired: string;
  searchFailed: string;
  searching: string;
  title: string;
}

export interface LocaleResourceTranslationNotifications {
  chatsDeleted: string;
  chatsDeletedDescription_one: string;
  chatsDeletedDescription_other: string;
  couldNotAddProject: string;
  couldNotChangeAgent: string;
  couldNotCreateChat: string;
  couldNotDeleteChats: string;
  couldNotLoadProjects: string;
  couldNotRenameChat: string;
  finished: string;
  needsAttention: string;
  needsInput: string;
  agentFinishedNoOutput: string;
  agentWaiting: string;
  chatActionFailed: string;
  permissionRequired: string;
  projectActionFailed: string;
  installUpdate: string;
  updateReady: string;
  updateReadyDescription: string;
}

export interface LocaleResourceTranslationProjects {
  chooseFolder: string;
  openInFinder: string;
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
  app: LocaleResourceTranslationApp;
  common: LocaleResourceTranslationCommon;
  attachment: LocaleResourceTranslationAttachment;
  workspace: LocaleResourceTranslationWorkspace;
  fleet: LocaleResourceTranslationFleet;
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
  projects: LocaleResourceTranslationProjects;
  ui: LocaleResourceTranslationUi;
  promptInput: LocaleResourceTranslationPromptInput;
  runtimeValues: LocaleResourceTranslationRuntimeValues;
}

export interface LocaleResource {
  translation: LocaleResourceTranslation;
}
