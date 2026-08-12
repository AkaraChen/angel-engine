export type MainIpcErrorCode =
  | "daemon-request-failed"
  | "daemon-unavailable"
  | "main-invalid-request"
  | "main-not-found"
  | "main-operation-failed";

export interface MainIpcErrorEnvelope {
  __angelMainIpcError: {
    code: MainIpcErrorCode;
    message: string;
  };
}

export function isMainIpcErrorEnvelope(
  value: unknown,
): value is MainIpcErrorEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const envelope = (value as { __angelMainIpcError?: unknown })
    .__angelMainIpcError;
  return (
    typeof envelope === "object" &&
    envelope !== null &&
    typeof (envelope as { code?: unknown }).code === "string" &&
    typeof (envelope as { message?: unknown }).message === "string"
  );
}
