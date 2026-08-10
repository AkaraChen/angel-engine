export interface LocaleResourceTranslationApp {
  name: string;
}

export interface LocaleResourceTranslationCommon {
  cancel: string;
  delete: string;
  edit: string;
  save: string;
  tryAgain: string;
  newChat: string;
  settings: string;
  daemonOfflineHint: string;
  showLess: string;
  showMore: string;
}

export interface LocaleResourceTranslationLogin {
  title: string;
  description: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  passwordHelp: string;
  showPassword: string;
  hidePassword: string;
  incorrectPassword: string;
  connectionError: string;
  recoveryHint: string;
  connecting: string;
  connect: string;
}

export interface LocaleResourceTranslationShell {
  backToChats: string;
  titleChats: string;
  titleChatFallback: string;
}

export interface LocaleResourceTranslationSidebar {
  home: string;
  navigationTitle: string;
  navigationDescription: string;
  close: string;
}

export interface LocaleResourceTranslationDaemonStatus {
  unreachable: string;
  connecting: string;
  online: string;
}

export interface LocaleResourceTranslationHomeSegments {
  all: string;
  attention: string;
  running: string;
  done: string;
}

export interface LocaleResourceTranslationHome {
  emptyTitle: string;
  emptyDescription: string;
  activityErrorTitle: string;
  errorTitle: string;
  filterSegments: string;
  segmentEmpty: string;
  segments: LocaleResourceTranslationHomeSegments;
}

export interface LocaleResourceTranslationActivityStatus {
  waitingForYou: string;
  failed: string;
  stuck: string;
  running: string;
  done: string;
}

export interface LocaleResourceTranslationActivity {
  status: LocaleResourceTranslationActivityStatus;
}

export interface LocaleResourceTranslationChat {
  thinking: string;
  turnFailed: string;
  emptyTitle: string;
  emptyDescription: string;
  errorTitle: string;
  runFailedTitle: string;
  messagePlaceholder: string;
  sendAria: string;
  stopAria: string;
  attachAria: string;
  attachments: string;
  removeAttachment: string;
  retryAttachment: string;
  roleUser: string;
  roleAssistant: string;
  sendFailed: string;
  attachmentErrors: {
    accept: string;
    maxFileSize: string;
    maxFiles: string;
    fileRead: string;
  };
  plan: string;
  todo: string;
  build: string;
  switchToPlan: string;
  switchToBuild: string;
  planCreated: string;
  planUpdated: string;
  planProgress: string;
  couldNotChangeMode: string;
  attentionNeedsInput: string;
  attentionNeedsInputDescription: string;
  attentionReview: string;
}

export interface LocaleResourceTranslationElicitation {
  defaultTitle: string;
  allow: string;
  allowForSession: string;
  deny: string;
  dismiss: string;
  submit: string;
  other: string;
  question: string;
  userInput: string;
  dynamicTool: string;
  permissionProfile: string;
  externalFlow: string;
}

export interface LocaleResourceTranslationCreateChatReasoningOptions {
  default: string;
  minimal: string;
  low: string;
  medium: string;
  high: string;
}

export interface LocaleResourceTranslationCreateChat {
  description: string;
  promptLabel: string;
  promptPlaceholder: string;
  promptRequired: string;
  projectLabel: string;
  noProject: string;
  agentLabel: string;
  modelLabel: string;
  modelPlaceholder: string;
  reasoningLabel: string;
  reasoningOptions: LocaleResourceTranslationCreateChatReasoningOptions;
  worktreeTitle: string;
  worktreeDescription: string;
  worktreeHint: string;
  error: string;
  create: string;
}

export interface LocaleResourceTranslationSettingsAppearanceThemeOptions {
  system: string;
  light: string;
  dark: string;
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

export interface LocaleResourceTranslationSettingsAppearance {
  title: string;
  theme: string;
  themeDescription: string;
  themeOptions: LocaleResourceTranslationSettingsAppearanceThemeOptions;
  language: string;
  languageDescription: string;
  languageOptions: LocaleResourceTranslationSettingsAppearanceLanguageOptions;
}

export interface LocaleResourceTranslationSettingsAbout {
  appDescription: string;
  appName: string;
  build: string;
  copied: string;
  copyDiagnostics: string;
  copyFailed: string;
  description: string;
  diagnostics: string;
  title: string;
}

export interface LocaleResourceTranslationSettingsConnection {
  title: string;
  description: string;
  server: string;
  sameOrigin: string;
  status: string;
  statusOnline: string;
  statusConnecting: string;
  statusUnreachable: string;
  daemonVersion: string;
  versionUnknown: string;
  disconnectSectionTitle: string;
  disconnectDescription: string;
  disconnect: string;
  disconnectConfirmTitle: string;
  disconnectConfirmDescription: string;
  disconnectConfirm: string;
}

export interface LocaleResourceTranslationSettingsProjects {
  actionError: string;
  add: string;
  createTitle: string;
  deleteAria: string;
  deleteChecking: string;
  deleteConflict: string;
  deleteImpact: string;
  deleteImpactOne: string;
  deleteImpactUnknown: string;
  deleteNoChats: string;
  deleteTitle: string;
  description: string;
  editAria: string;
  editTitle: string;
  empty: string;
  filesKept: string;
  formDescription: string;
  loadError: string;
  pathInvalid: string;
  pathLabel: string;
  pathPlaceholder: string;
  pathRequired: string;
  title: string;
}

export interface LocaleResourceTranslationSettingsCustomAgents {
  actionError: string;
  add: string;
  argsLabel: string;
  argsPlaceholder: string;
  autoAuthenticateLabel: string;
  commandLabel: string;
  commandRequired: string;
  createTitle: string;
  deleteAria: string;
  deleteChecking: string;
  deleteImpact: string;
  deleteImpactOne: string;
  deleteImpactUnknown: string;
  deleteNoChats: string;
  deleteTitle: string;
  description: string;
  editAria: string;
  editTitle: string;
  empty: string;
  environmentHint: string;
  environmentLabel: string;
  environmentPlaceholder: string;
  formDescription: string;
  loadError: string;
  nameLabel: string;
  nameRequired: string;
  needAuthLabel: string;
  title: string;
}

export interface LocaleResourceTranslationSettings {
  appearance: LocaleResourceTranslationSettingsAppearance;
  connection: LocaleResourceTranslationSettingsConnection;
  customAgents: LocaleResourceTranslationSettingsCustomAgents;
  projects: LocaleResourceTranslationSettingsProjects;
  about: LocaleResourceTranslationSettingsAbout;
}

export interface LocaleResourceTranslation {
  app: LocaleResourceTranslationApp;
  common: LocaleResourceTranslationCommon;
  login: LocaleResourceTranslationLogin;
  shell: LocaleResourceTranslationShell;
  sidebar: LocaleResourceTranslationSidebar;
  daemonStatus: LocaleResourceTranslationDaemonStatus;
  home: LocaleResourceTranslationHome;
  activity: LocaleResourceTranslationActivity;
  chat: LocaleResourceTranslationChat;
  elicitation: LocaleResourceTranslationElicitation;
  createChat: LocaleResourceTranslationCreateChat;
  settings: LocaleResourceTranslationSettings;
}

export interface LocaleResource {
  translation: LocaleResourceTranslation;
}
