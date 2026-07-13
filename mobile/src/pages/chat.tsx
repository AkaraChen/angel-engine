import type { ChatMessage } from "@/platform/chat-types";

import { PaperPlaneTilt } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Message, MessageContent, MessageGroup } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { takeNewChatPrompt } from "@/features/chat/new-chat-prompt";
import { cn } from "@/lib/utils";

// Placeholder transcript so the shadcn chat components render in the shell.
// The Chat sub-issue replaces this with live engine data.
const DEMO_MESSAGES: ChatMessage[] = [
  { id: "1", role: "assistant", text: "Hi! How can I help you today?" },
];

export function ChatPage({ chatId }: { chatId: string }) {
  // The Home composer creates an empty chat and stashes the first message; pick
  // it up once so it isn't lost (a later sub-issue wires the real send).
  const [draft, setDraft] = useState(() => takeNewChatPrompt(chatId) ?? "");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport className="h-full">
            <MessageScrollerContent className="flex flex-col gap-4 p-4">
              {DEMO_MESSAGES.map((message) => (
                <MessageGroup key={message.id}>
                  <Message align={message.role === "user" ? "end" : "start"}>
                    <MessageContent>
                      <div
                        className={cn(
                          "w-fit rounded-xl px-3 py-2 text-sm",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted",
                        )}
                      >
                        {message.text}
                      </div>
                    </MessageContent>
                  </Message>
                </MessageGroup>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>

      <form
        className="
          flex shrink-0 items-center gap-2 border-t border-border p-2
          pb-[max(0.5rem,env(safe-area-inset-bottom))]
        "
        onSubmit={(event) => event.preventDefault()}
      >
        <Input
          className="flex-1"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message"
          value={draft}
        />
        <Button aria-label="Send" size="icon" type="submit">
          <PaperPlaneTilt size={18} />
        </Button>
      </form>
    </div>
  );
}
