import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  path: text("path").notNull().unique(),
});

export const customAgents = sqliteTable("custom_agents", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  command: text("command").notNull(),
  args: text("args").notNull(),
  environment: text("environment").notNull(),
  needAuth: integer("need_auth", { mode: "boolean" }).notNull().default(false),
  autoAuthenticate: integer("auto_authenticate", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    cwd: text("cwd"),
    runtime: text("runtime").notNull(),
    remoteThreadId: text("remote_thread_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("chats_project_id_idx").on(table.projectId),
    index("chats_updated_at_idx").on(table.updatedAt),
  ],
);

export const worktreeCreationJobs = sqliteTable("worktree_creation_jobs", {
  chatId: text("chat_id")
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  error: text("error"),
  jobId: text("job_id").notNull(),
  progress: integer("progress").notNull(),
  setupApproval: text("setup_approval"),
  stage: text("stage").notNull(),
  status: text("status").notNull(),
});

export const queuedChatRuns = sqliteTable(
  "queued_chat_runs",
  {
    runId: text("run_id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .unique()
      .references(() => chats.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    input: text("input").notNull(),
  },
  (table) => [index("queued_chat_runs_chat_id_idx").on(table.chatId)],
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type CustomAgentRow = typeof customAgents.$inferSelect;
export type NewCustomAgentRow = typeof customAgents.$inferInsert;
export type ChatRow = typeof chats.$inferSelect;
export type NewChatRow = typeof chats.$inferInsert;
export type WorktreeCreationJobRow = typeof worktreeCreationJobs.$inferSelect;
export type QueuedChatRunRow = typeof queuedChatRuns.$inferSelect;
