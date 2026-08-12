import type {
  CheckRun,
  FailureLogResult,
  ReviewThread,
} from "@angel-engine/daemon-api/source-control";

export interface ShepherdPromptParts {
  round: number;
  maxRounds: number;
  failedRequired: readonly CheckRun[];
  newComments: readonly {
    author: string | null;
    body: string;
    path: string | null;
    line: number | null;
  }[];
  failureLogs: readonly { checkName: string; log: FailureLogResult }[];
}

export function buildShepherdPrompt(parts: ShepherdPromptParts): string {
  const triggers: string[] = [];
  for (const check of parts.failedRequired) {
    const label = check.group?.name
      ? `${check.name} (${check.group.name})`
      : check.name;
    triggers.push(`\`${label}\` failed`);
  }
  if (parts.newComments.length > 0) {
    triggers.push(`${parts.newComments.length} 条新 review 评论`);
  }
  const triggerText =
    triggers.length > 0 ? triggers.join(" · ") : "PR 需要处理";

  const lines: string[] = [
    `🐑 Shepherd round ${parts.round}/${parts.maxRounds} · 触发：${triggerText}`,
    "",
    "请根据下面的 CI 失败与/或 review 评论修复问题，完成后 push 到当前 PR 分支。",
    "",
  ];

  if (parts.failedRequired.length > 0) {
    lines.push("## Required check failures");
    for (const check of parts.failedRequired) {
      lines.push(
        `- ${check.name}` +
          (check.conclusion ? ` → ${check.conclusion}` : "") +
          (check.detailsUrl ? ` (${check.detailsUrl})` : ""),
      );
    }
    lines.push("");
  }

  for (const entry of parts.failureLogs) {
    lines.push(`## Failure log: ${entry.checkName}`);
    if (entry.log.truncated) lines.push("_(truncated to last 40 lines)_");
    if (entry.log.text.length === 0) {
      lines.push("_(no log output)_");
    } else {
      lines.push("```", ...entry.log.text.split("\n"), "```");
    }
    lines.push("");
  }

  if (parts.newComments.length > 0) {
    lines.push("## New review comments");
    for (const comment of parts.newComments) {
      const location =
        comment.path !== null
          ? ` @ ${comment.path}${comment.line !== null ? `:${comment.line}` : ""}`
          : "";
      lines.push(`### ${comment.author ?? "unknown"}${location}`);
      lines.push(comment.body.trim() || "_(empty comment)_", "");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function collectNewComments(
  unresolved: readonly ReviewThread[],
  unhandledCommentIds: ReadonlySet<string>,
): Array<{
  author: string | null;
  body: string;
  path: string | null;
  line: number | null;
}> {
  const comments = [];
  for (const thread of unresolved) {
    if (thread.state !== "unresolved") continue;
    for (const comment of thread.comments) {
      if (!unhandledCommentIds.has(comment.id)) continue;
      comments.push({
        author: comment.author?.login ?? null,
        body: comment.body,
        path: thread.location?.path ?? null,
        line: thread.location?.endLine ?? null,
      });
    }
  }
  return comments;
}
