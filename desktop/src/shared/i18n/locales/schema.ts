export interface LocaleResourceTranslationApp {
  name: string;
}

export interface LocaleResourceTranslationCommon {
  allow: string;
  allowSession: string;
  answered: string;
  attachment: string;
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
  newProject: string;
  noProject: string;
  projectSelect: string;
  settings: string;
  worktreeDirtyContinue: string;
  worktreeDirtyDescription: string;
  worktreeDirtyRemember: string;
  worktreeDirtyTitle: string;
  worktreeNotGitRepository: string;
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
  restore: string;
  restoredToast: string;
  restoreSelected: string;
  selectAll: string;
  selectedCount: string;
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
  workspace: string;
}

export interface LocaleResourceTranslationSettingsMobile {
  copied: string;
  copy: string;
  enabledDescription: string;
  enabledTitle: string;
  hostDescription: string;
  hostTitle: string;
  urlDisabled: string;
  urlPending: string;
  urlTitle: string;
}

export interface LocaleResourceTranslationSettingsWorkspace {
  dirtyPromptDescription: string;
  dirtyPromptSwitchLabel: string;
  dirtyPromptTitle: string;
}

export interface LocaleResourceTranslationSettings {
  agents: LocaleResourceTranslationSettingsAgents;
  appearance: LocaleResourceTranslationSettingsAppearance;
  archived: LocaleResourceTranslationSettingsArchived;
  danger: LocaleResourceTranslationSettingsDanger;
  description: string;
  mobile: LocaleResourceTranslationSettingsMobile;
  tabs: LocaleResourceTranslationSettingsTabs;
  title: string;
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
  couldNotSendAttachment: string;
  tooManyFiles: string;
}

export interface LocaleResourceTranslationComposer {
  agentMode: string;
  agentSettings: string;
  attachFiles: string;
  attachmentErrors: LocaleResourceTranslationComposerAttachmentErrors;
  commands: string;
  couldNotReadAttachment: string;
  disabledReasons: LocaleResourceTranslationComposerDisabledReasons;
  effort: string;
  fileTypeBlocked: string;
  fileTooLarge: string;
  files: string;
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
  renameChat: string;
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
}

export interface LocaleResourceTranslationUi {
  commandDescription: string;
  commandPalette: string;
}

export interface LocaleResourceTranslationPromptInput {
  addPhotosOrFiles: string;
  placeholder: string;
  takeScreenshot: string;
  uploadFiles: string;
}

export interface LocaleResourceTranslation {
  app: LocaleResourceTranslationApp;
  common: LocaleResourceTranslationCommon;
  attachment: LocaleResourceTranslationAttachment;
  workspace: LocaleResourceTranslationWorkspace;
  sidebar: LocaleResourceTranslationSidebar;
  settings: LocaleResourceTranslationSettings;
  updates: LocaleResourceTranslationUpdates;
  thread: LocaleResourceTranslationThread;
  composer: LocaleResourceTranslationComposer;
  components: LocaleResourceTranslationComponents;
  messages: LocaleResourceTranslationMessages;
  dialog: LocaleResourceTranslationDialog;
  notifications: LocaleResourceTranslationNotifications;
  projects: LocaleResourceTranslationProjects;
  ui: LocaleResourceTranslationUi;
  promptInput: LocaleResourceTranslationPromptInput;
}

export interface LocaleResource {
  translation: LocaleResourceTranslation;
}
