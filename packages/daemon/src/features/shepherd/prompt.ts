import type {
  GitHubCheckItem,
  GitHubFailureLogResult,
  GitHubReviewThread,
} from "@angel-engine/daemon-api/github";

export interface ShepherdPromptParts {
  round: number;
  maxRounds: number;
  failedRequired: readonly GitHubCheckItem[];
  newComments: readonly {
    author: string | null;
    body: string;
    path: string | null;
    line: number | null;
  }[];
  /** Failure log tails keyed by check name. */
  failureLogs: readonly {
    checkName: string;
    log: GitHubFailureLogResult;
  }[];
}

/**
 * Build the auto-turn prompt with a collapsible source card header.
 * The card is the audit trail for this shepherd round.
 */
export function buildShepherdPrompt(parts: ShepherdPromptParts): string {
  const triggers: string[] = [];
  for (const check of parts.failedRequired) {
    const label = check.workflowName
      ? `${check.name} (${check.workflowName})`
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
    if (entry.log.truncated) {
      lines.push("_(truncated to last 40 lines)_");
    }
    if (entry.log.lines.length === 0) {
      lines.push("_(no log output)_");
    } else {
      lines.push("```");
      lines.push(...entry.log.lines);
      lines.push("```");
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
      const author = comment.author ?? "unknown";
      lines.push(`### ${author}${location}`);
      lines.push(comment.body.trim() || "_(empty comment)_");
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function collectNewComments(
  unresolved: readonly GitHubReviewThread[],
  unhandledCommentIds: ReadonlySet<string>,
): Array<{
  author: string | null;
  body: string;
  path: string | null;
  line: number | null;
}> {
  const comments: Array<{
    author: string | null;
    body: string;
    path: string | null;
    line: number | null;
  }> = [];
  for (const thread of unresolved) {
    for (const comment of thread.comments) {
      if (!unhandledCommentIds.has(comment.id)) continue;
      comments.push({
        author: comment.author,
        body: comment.body,
        path: comment.path ?? thread.path,
        line: comment.line ?? thread.line,
      });
    }
  }
  return comments;
}
