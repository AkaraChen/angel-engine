import type { ApiClient } from "@/platform/api-client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  sourceControlNamespacesQueryOptions,
  sourceControlRepositoriesQueryOptions,
} from "./queries";

describe("source-control repository discovery", () => {
  it("makes no business request without an active provider", async () => {
    const listNamespaces = vi.fn();
    const listRepositories = vi.fn();
    const queryClient = new QueryClient();
    const namespaceObserver = new QueryObserver(
      queryClient,
      sourceControlNamespacesQueryOptions({
        api: {
          sourceControl: { listNamespaces },
        } as unknown as ApiClient,
        projectPath: null,
        providerIdentity: null,
        supported: true,
      }),
    );
    const repositoryObserver = new QueryObserver(
      queryClient,
      sourceControlRepositoriesQueryOptions({
        api: {
          sourceControl: { listRepositories },
        } as unknown as ApiClient,
        namespace: ["acme"],
        projectPath: null,
        providerIdentity: null,
        supported: true,
      }),
    );
    const unsubscribeNamespaces = namespaceObserver.subscribe(() => undefined);
    const unsubscribeRepositories = repositoryObserver.subscribe(
      () => undefined,
    );

    await Promise.resolve();

    expect(listNamespaces).not.toHaveBeenCalled();
    expect(listRepositories).not.toHaveBeenCalled();
    unsubscribeNamespaces();
    unsubscribeRepositories();
  });

  it("isolates namespace and repository caches by provider identity", () => {
    const api = { sourceControl: {} } as unknown as ApiClient;
    const forgeIdentity = "forge:forge.com/acme/widgets:1";
    const gitlabIdentity = "gitlab:gitlab.example.com/acme/widgets:2";

    expect(
      sourceControlNamespacesQueryOptions({
        api,
        projectPath: "/repo",
        providerIdentity: forgeIdentity,
        supported: true,
      }).queryKey,
    ).not.toEqual(
      sourceControlNamespacesQueryOptions({
        api,
        projectPath: "/repo",
        providerIdentity: gitlabIdentity,
        supported: true,
      }).queryKey,
    );
    expect(
      sourceControlRepositoriesQueryOptions({
        api,
        namespace: ["acme"],
        projectPath: "/repo",
        providerIdentity: forgeIdentity,
        supported: true,
      }).queryKey,
    ).not.toEqual(
      sourceControlRepositoriesQueryOptions({
        api,
        namespace: ["acme"],
        projectPath: "/repo",
        providerIdentity: gitlabIdentity,
        supported: true,
      }).queryKey,
    );
  });
});
