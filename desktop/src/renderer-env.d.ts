declare global {
  interface Window {
    ipcInvoke: (
      channel: string,
      input?: unknown
    ) => Promise<unknown>;
  }
}

export {};
