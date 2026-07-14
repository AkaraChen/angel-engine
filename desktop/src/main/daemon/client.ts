import { fetchDaemon } from "./supervisor";

export async function daemonJson<T>(pathname: string, init?: RequestInit) {
  const response = await fetchDaemon(pathname, init);
  if (response === undefined) throw new Error("Backend is unavailable.");
  const body = (await response.json()) as T | { error: string };
  if (!response.ok) {
    throw new Error(
      "error" in (body as { error?: string })
        ? (body as { error: string }).error
        : `Backend request failed (${response.status}).`,
    );
  }
  return body as T;
}

export function jsonRequest(method: string, body?: object): RequestInit {
  return {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  };
}
