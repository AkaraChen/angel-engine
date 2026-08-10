import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { resolveLinearIssue } from "./linear-api";

const parsed = {
  identifier: "ENG-42",
  kind: "issue",
  provider: "linear",
  team: "ENG",
  url: "https://linear.app/acme/issue/ENG-42/fix-widget",
} as const;

describe("resolveLinearIssue", () => {
  it("requires a token before making a request", async () => {
    await expect(Effect.runPromise(resolveLinearIssue(parsed))).rejects.toThrow(
      "Connect Linear in Settings",
    );
  });

  it("maps a Linear issue into task-link context", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: {
          issue: {
            description: "Fix the failing widget.",
            identifier: "ENG-42",
            state: { name: "In Progress" },
            title: "Repair widget",
            url: parsed.url,
          },
        },
      }),
    );

    const resolved = await Effect.runPromise(
      resolveLinearIssue(parsed, { fetch: fetchMock, token: "lin_api_test" }),
    );

    expect(resolved).toMatchObject({
      identifier: "ENG-42",
      provider: "linear",
      title: "Repair widget",
    });
    expect(resolved.contextText).toContain("Fix the failing widget.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps rejected credentials without exposing the token", async () => {
    await expect(
      Effect.runPromise(
        resolveLinearIssue(parsed, {
          fetch: async () => new Response(null, { status: 401 }),
          token: "lin_api_secret",
        }),
      ),
    ).rejects.toThrow("Linear rejected the configured API token");
  });
});
