import type {
  ParsedTaskLink,
  ResolvedTaskLink,
} from "@angel-engine/daemon-api/links";
import { type as arkType } from "arktype";
import { Effect } from "effect";
import { DaemonError } from "../../platform/errors";
import { getLinearToken } from "./secrets";

const LINEAR_API_URL = "https://api.linear.app/graphql";
const BODY_MAX_CHARS = 12_000;
const linearPayloadSchema = arkType({
  data: {
    issue: {
      description: "string | null",
      identifier: "string > 0",
      state: { name: "string > 0" },
      title: "string > 0",
      url: "string > 0",
    },
  },
});

type ParsedLinearLink = Extract<ParsedTaskLink, { provider: "linear" }>;

export function resolveLinearIssue(
  parsed: ParsedLinearLink,
  deps: { fetch?: typeof fetch; token?: string } = {},
): Effect.Effect<ResolvedTaskLink, DaemonError> {
  return Effect.gen(function* () {
    const token = deps.token ?? getLinearToken();
    if (token === undefined || token.length === 0) {
      return yield* Effect.fail(DaemonError.linearTokenMissing());
    }

    const response = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.linearFetchFailed(cause),
      try: () =>
        (deps.fetch ?? fetch)(LINEAR_API_URL, {
          body: JSON.stringify({
            query:
              "query ResolveIssue($id: String!) { issue(id: $id) { identifier title description url state { name } } }",
            variables: { id: parsed.identifier },
          }),
          headers: {
            authorization: token,
            "content-type": "application/json",
          },
          method: "POST",
          signal: AbortSignal.timeout(30_000),
        }),
    });
    if (response.status === 401 || response.status === 403) {
      return yield* Effect.fail(DaemonError.linearUnauthorized());
    }
    if (!response.ok) {
      return yield* Effect.fail(
        DaemonError.linearFetchFailed(
          new Error(`Linear returned HTTP ${response.status}.`),
        ),
      );
    }

    const json = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.linearFetchFailed(cause),
      try: () => response.json(),
    });
    const payload = linearPayloadSchema(json);
    if (payload instanceof arkType.errors) {
      const hasMissingIssue =
        typeof json === "object" && json !== null && "data" in json;
      return yield* Effect.fail(
        hasMissingIssue
          ? DaemonError.linearItemNotFound()
          : DaemonError.linearFetchFailed(
              new TypeError(`Unexpected Linear payload: ${payload.summary}`),
            ),
      );
    }

    const issue = payload.data.issue;
    const body = (issue.description ?? "").trim().slice(0, BODY_MAX_CHARS);
    return {
      body,
      contextText: [
        `Linear Issue ${issue.identifier} — ${issue.title}`,
        "",
        `Source: ${issue.url}`,
        `State: ${issue.state.name}`,
        "",
        "Description:",
        body.length > 0 ? body : "(empty)",
      ].join("\n"),
      identifier: issue.identifier,
      kind: "issue",
      provider: "linear",
      state: issue.state.name,
      team: parsed.team,
      title: issue.title,
      url: issue.url,
    };
  });
}
