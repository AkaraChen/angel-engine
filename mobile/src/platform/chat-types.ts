/**
 * View-model shapes for the mobile chat UI.
 *
 * The desktop's chat types live in `@angel-engine/js-client`, but that package
 * pulls in the native `@angel-engine/client-napi` binding and is not consumable
 * from a browser bundle. Once the daemon exposes chat data over HTTP (it does
 * not today — see `packages/daemon/src/server.ts`), the data sub-issue should
 * reuse the shared `Chat`/`ChatHistoryMessage` types (or a serialized subset)
 * at the client boundary and drop these locals.
 */
export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}
