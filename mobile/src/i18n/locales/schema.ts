export interface LocaleResourceTranslationApp {
  name: string;
}

export interface LocaleResourceTranslationCommon {
  cancel: string;
  tryAgain: string;
  newChat: string;
  settings: string;
  daemonOfflineHint: string;
}

export interface LocaleResourceTranslationLogin {
  title: string;
  description: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  incorrectPassword: string;
  connectionError: string;
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
}

export interface LocaleResourceTranslationDaemonStatus {
  unreachable: string;
  connecting: string;
  online: string;
}

export interface LocaleResourceTranslationHome {
  emptyTitle: string;
  emptyDescription: string;
  errorTitle: string;
}

export interface LocaleResourceTranslationChat {
  thinking: string;
  turnFailed: string;
  emptyTitle: string;
  emptyDescription: string;
  errorTitle: string;
  messagePlaceholder: string;
  sendAria: string;
  stopAria: string;
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
  title: string;
  description: string;
  appName: string;
  appDescription: string;
}

export interface LocaleResourceTranslationSettings {
  appearance: LocaleResourceTranslationSettingsAppearance;
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
  chat: LocaleResourceTranslationChat;
  elicitation: LocaleResourceTranslationElicitation;
  createChat: LocaleResourceTranslationCreateChat;
  settings: LocaleResourceTranslationSettings;
}

export interface LocaleResource {
  translation: LocaleResourceTranslation;
}
