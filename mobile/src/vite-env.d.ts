/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DAEMON_URL?: string;
  readonly VITE_DAEMON_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
