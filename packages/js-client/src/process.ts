export type SessionProcessIdListener = (processId: number | undefined) => void;

export interface SessionProcess {
  processId(): number | undefined;
  subscribeProcessId(listener: SessionProcessIdListener): () => void;
}
