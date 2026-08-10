import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { chatDiffAnchors } from "../../db/schema";
import { withDatabase } from "../../platform/db";

export type ChatDiffAnchorKind = "session" | "turn";

export function getChatDiffAnchor(chatId: string, kind: ChatDiffAnchorKind) {
  return withDatabase((database) =>
    database
      .select()
      .from(chatDiffAnchors)
      .where(
        and(eq(chatDiffAnchors.chatId, chatId), eq(chatDiffAnchors.kind, kind)),
      )
      .orderBy(desc(chatDiffAnchors.recordedAt))
      .limit(1)
      .get(),
  );
}

export function recordSessionDiffAnchor(chatId: string, sha: string) {
  return Effect.gen(function* () {
    const existing = yield* getChatDiffAnchor(chatId, "session");
    if (existing) return existing;
    return yield* insertDiffAnchor({ chatId, kind: "session", sha });
  });
}

export function recordChatTurnStart(chatId: string, sha: string) {
  return Effect.gen(function* () {
    yield* recordSessionDiffAnchor(chatId, sha);
    return yield* recordTurnDiffAnchor(chatId, null, sha);
  });
}

export function recordTurnDiffAnchor(
  chatId: string,
  turnId: string | null,
  sha: string,
) {
  return Effect.gen(function* () {
    const anchor = yield* insertDiffAnchor({
      chatId,
      kind: "turn",
      sha,
      turnId,
    });
    const stale = yield* withDatabase((database) =>
      database
        .select({ id: chatDiffAnchors.id })
        .from(chatDiffAnchors)
        .where(
          and(
            eq(chatDiffAnchors.chatId, chatId),
            eq(chatDiffAnchors.kind, "turn"),
          ),
        )
        .orderBy(desc(chatDiffAnchors.recordedAt))
        .limit(100)
        .offset(20)
        .all(),
    );
    for (const anchor of stale) {
      yield* withDatabase((database) =>
        database
          .delete(chatDiffAnchors)
          .where(eq(chatDiffAnchors.id, anchor.id))
          .run(),
      );
    }
    return anchor;
  });
}

export function setTurnDiffAnchorTurnId(id: string, turnId: string) {
  return withDatabase((database) =>
    database
      .update(chatDiffAnchors)
      .set({ turnId })
      .where(eq(chatDiffAnchors.id, id))
      .run(),
  );
}

function insertDiffAnchor({
  chatId,
  kind,
  sha,
  turnId,
}: {
  chatId: string;
  kind: ChatDiffAnchorKind;
  sha: string;
  turnId?: string | null;
}) {
  return withDatabase((database) =>
    database
      .insert(chatDiffAnchors)
      .values({
        chatId,
        id: randomUUID(),
        kind,
        recordedAt: new Date().toISOString(),
        sha,
        turnId,
      })
      .returning()
      .get(),
  );
}
