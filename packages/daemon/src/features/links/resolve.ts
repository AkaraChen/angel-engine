import type {
  ResolvedTaskLink,
  TaskLinkResolveInput,
} from "@angel-engine/daemon-api/links";
import { Effect } from "effect";
import { DaemonError } from "../../platform/errors";
import { resolveGitHubUrl } from "../github/resolve";
import { resolveLinearIssue } from "./linear-api";
import { parseTaskLink } from "./parse";

export function resolveTaskLink(
  input: TaskLinkResolveInput,
): Effect.Effect<ResolvedTaskLink, DaemonError> {
  return Effect.gen(function* () {
    const parsed = parseTaskLink(input.url);
    if (parsed === null) {
      return yield* Effect.fail(DaemonError.linkUnsupported());
    }
    if (parsed.provider === "linear") return yield* resolveLinearIssue(parsed);

    const item = yield* resolveGitHubUrl({ url: parsed.url });
    if (item.kind === "pullRequest" && item.isCrossRepository === true) {
      return yield* Effect.fail(DaemonError.prFromForkUnsupported());
    }
    return { ...item, provider: "github" };
  });
}
