import type {
  Chat,
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatStreamEvent,
} from "@angel-engine/js-client";
import { AngelClient, MockAgentAdapter } from "@angel-engine/js-client";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const client = new AngelClient({
  adapters: [new MockAgentAdapter({ delayMs: 55 })],
  defaultRuntime: "mock",
});

void client.projects.create({
  id: "playground",
  path: "/mock/playground",
});

function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [events, setEvents] = useState<ChatStreamEvent[]>([]);
  const [prompt, setPrompt] = useState(
    "Show me how the JS client streams a mock agent run.",
  );
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    return client.subscribe(() => {
      void refresh();
    });
  }, []);

  async function refresh(chatId?: string | null) {
    const nextChats = await client.chats.list();
    setChats(nextChats);
    const selectedChatId =
      chatId === null
        ? undefined
        : (chatId ?? activeChatId ?? nextChats[0]?.id);
    setActiveChatId(selectedChatId);
    setMessages(
      selectedChatId ? (await client.chats.load(selectedChatId)).messages : [],
    );
  }

  async function sendPrompt() {
    const text = prompt.trim();
    if (!text || isRunning) return;

    setIsRunning(true);
    setEvents([]);
    try {
      const result = await client.chats.send(
        {
          chatId: activeChatId,
          projectId: "playground",
          runtime: "mock",
          text,
        },
        (event: ChatStreamEvent) => {
          setEvents((current) => [...current, event]);
          if (event.type === "chat") setActiveChatId(event.chat.id);
        },
      );
      setActiveChatId(result.chatId);
      await refresh(result.chatId);
    } finally {
      setIsRunning(false);
    }
  }

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId),
    [activeChatId, chats],
  );

  return (
    <main className="shell">
      <section className="toolbar">
        <div>
          <p className="eyebrow">Angel Engine</p>
          <h1>JS Client Playground</h1>
        </div>
        <button
          onClick={() => {
            void client.chats.deleteAll().then(() => {
              setActiveChatId(undefined);
              setEvents([]);
              void refresh(null);
            });
          }}
          type="button"
        >
          Reset
        </button>
      </section>

      <section className="layout">
        <aside className="sidebar">
          <h2>Chats</h2>
          {chats.length === 0 ? (
            <p className="muted">No chats yet.</p>
          ) : (
            <div className="chat-list">
              {chats.map((chat) => (
                <button
                  className={chat.id === activeChatId ? "selected" : ""}
                  key={chat.id}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    void refresh(chat.id);
                  }}
                  type="button"
                >
                  <span>{chat.title}</span>
                  <small>{chat.runtime}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="thread">
          <div className="thread-header">
            <div>
              <h2>{activeChat?.title ?? "Draft chat"}</h2>
              <p className="muted">Pure frontend mock adapter, no backend.</p>
            </div>
            <span className={isRunning ? "status running" : "status"}>
              {isRunning ? "Streaming" : "Idle"}
            </span>
          </div>

          <div className="messages" aria-live="polite">
            {messages.length === 0 ? (
              <p className="empty">Send a prompt to create a chat run.</p>
            ) : (
              messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <strong>{message.role}</strong>
                  <div>{message.content.map(renderPart)}</div>
                </article>
              ))
            )}
          </div>

          <div className="composer">
            <textarea
              onChange={(event) => setPrompt(event.target.value)}
              value={prompt}
            />
            <button
              disabled={isRunning || !prompt.trim()}
              onClick={() => void sendPrompt()}
              type="button"
            >
              Send
            </button>
          </div>
        </section>

        <aside className="events">
          <h2>Stream Events</h2>
          <div className="event-list">
            {events.map((event, index) => (
              <pre key={`${event.type}-${index}`}>
                {JSON.stringify(event, null, 2)}
              </pre>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function renderPart(part: ChatHistoryMessagePart, index: number) {
  switch (part.type) {
    case "reasoning":
      return (
        <p className="reasoning" key={index}>
          {part.text}
        </p>
      );
    case "text":
      return <p key={index}>{part.text}</p>;
    case "data":
      return (
        <pre className="data" key={index}>
          {JSON.stringify(part.data, null, 2)}
        </pre>
      );
    case "tool-call":
      return (
        <pre className="tool" key={index}>
          {part.toolName}: {String(part.result ?? part.argsText)}
        </pre>
      );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
