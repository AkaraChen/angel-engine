import type { Chat } from "@angel-engine/daemon-api/chat";
import type {
  GitHubPullRequestDetail,
  GitHubPullRequestListItem,
} from "@angel-engine/daemon-api/github";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { ReactElement } from "react";
import { DaemonRequestError } from "@angel-engine/daemon-client";
import {
  GitPullRequest,
  MagnifyingGlass as SearchIcon,
  PushPin,
  SpinnerGap,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  addPullRequestCommentMutationOptions,
  createWorkspaceFromPullRequestMutationOptions,
  pullRequestDetailQueryOptions,
  pullRequestListQueryOptions,
} from "@/features/pull-requests/api/queries";
import { CreatePullRequestDialog } from "@/features/pull-requests/create-pull-request-dialog";
import {
  isPullRequestPinned,
  listPinnedPullRequests,
  setPullRequestPinned,
} from "@/features/pull-requests/pin-store";
import { formatRelativeTime } from "@/platform/format-time";
import { queryKeys } from "@/platform/query-keys";
import { useApi } from "@/platform/use-api";
import { cn } from "@/platform/utils";

interface PullRequestsPageProps {
  onOpenChat: (chat: Chat) => void;
  project: Project;
}

type ListState = "open" | "closed" | "merged" | "all";

export function PullRequestsPage({
  onOpenChat,
  project,
}: PullRequestsPageProps): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<ListState>("open");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [pinVersion, setPinVersion] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const cwd = project.path;
  const listQuery = useQuery(
    pullRequestListQueryOptions({
      api,
      cwd,
      query: search.trim(),
      state,
    }),
  );
  const detailQuery = useQuery(
    pullRequestDetailQueryOptions({
      api,
      cwd,
      number: selectedNumber,
    }),
  );

  const pinned = useMemo(
    () => new Set(listPinnedPullRequests(project.id)),
    // pinVersion forces recompute after pin toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.id, pinVersion],
  );

  const items = useMemo(() => {
    const list = listQuery.data?.items ?? [];
    return [...list].sort((left, right) => {
      const leftPinned = pinned.has(left.number) ? 0 : 1;
      const rightPinned = pinned.has(right.number) ? 0 : 1;
      if (leftPinned !== rightPinned) return leftPinned - rightPinned;
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }, [listQuery.data?.items, pinned]);

  const workspaceMutation = useMutation({
    ...createWorkspaceFromPullRequestMutationOptions({ api }),
    onError: (error) => setActionError(errorMessage(error)),
    onSuccess: async (result) => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chats.list() });
      const chats = await queryClient.fetchQuery({
        queryFn: async () => api.chats.list(),
        queryKey: queryKeys.chats.list(),
      });
      const chat = chats.find((entry) => entry.id === result.chatId);
      if (chat) onOpenChat(chat);
    },
  });

  const commentMutation = useMutation({
    ...addPullRequestCommentMutationOptions({ api }),
    onError: (error) => setActionError(errorMessage(error)),
    onSuccess: async () => {
      setActionError(null);
      setCommentDraft("");
      if (selectedNumber !== null) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.github.pullRequestDetail(cwd, selectedNumber),
        });
      }
    },
  });

  const detail = detailQuery.data;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <GitPullRequest className="size-5 shrink-0" weight="duotone" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              {t("pullRequests.title")}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {t("pullRequests.subtitle", { project: project.path })}
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          {t("pullRequests.create")}
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-[12rem] max-w-sm flex-1">
          <InputGroupAddon>
            <SearchIcon className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("pullRequests.search")}
            value={search}
          />
        </InputGroup>
        <NativeSelect
          aria-label={t("pullRequests.filterState")}
          onChange={(event) => setState(event.target.value as ListState)}
          value={state}
        >
          <NativeSelectOption value="open">
            {t("pullRequests.states.open")}
          </NativeSelectOption>
          <NativeSelectOption value="closed">
            {t("pullRequests.states.closed")}
          </NativeSelectOption>
          <NativeSelectOption value="merged">
            {t("pullRequests.states.merged")}
          </NativeSelectOption>
          <NativeSelectOption value="all">
            {t("pullRequests.states.all")}
          </NativeSelectOption>
        </NativeSelect>
      </div>

      {actionError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/70">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listQuery.isPending ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton className="h-14 w-full" key={index} />
                ))}
              </div>
            ) : listQuery.isError ? (
              <p className="p-3 text-sm text-destructive">
                {errorMessage(listQuery.error)}
              </p>
            ) : items.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {t("pullRequests.empty")}
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {items.map((item) => (
                  <PullRequestListRow
                    isPinned={pinned.has(item.number)}
                    isSelected={item.number === selectedNumber}
                    item={item}
                    key={item.number}
                    onOpen={() => {
                      setSelectedNumber(item.number);
                      setActionError(null);
                    }}
                    onTogglePin={() => {
                      setPullRequestPinned(
                        project.id,
                        item.number,
                        !isPullRequestPinned(project.id, item.number),
                      );
                      setPinVersion((value) => value + 1);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/70">
          {selectedNumber === null ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              {t("pullRequests.selectPrompt")}
            </div>
          ) : detailQuery.isPending && !detail ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : detailQuery.isError ? (
            <p className="p-4 text-sm text-destructive">
              {errorMessage(detailQuery.error)}
            </p>
          ) : detail ? (
            <PullRequestDetailPanel
              commentDraft={commentDraft}
              commentPending={commentMutation.isPending}
              detail={detail}
              onCommentChange={setCommentDraft}
              onOpenWorkspace={() =>
                workspaceMutation.mutate({
                  number: detail.number,
                  projectId: project.id,
                  title: `PR #${detail.number}: ${detail.title}`,
                })
              }
              onSubmitComment={() => {
                if (!is.nonEmptyString(commentDraft.trim())) return;
                commentMutation.mutate({
                  body: commentDraft.trim(),
                  cwd,
                  number: detail.number,
                });
              }}
              workspacePending={workspaceMutation.isPending}
            />
          ) : null}
        </section>
      </div>

      <CreatePullRequestDialog
        cwd={cwd}
        onCreated={(number) => {
          setCreateOpen(false);
          setSelectedNumber(number);
          void queryClient.invalidateQueries({
            queryKey: queryKeys.github.pullRequests(cwd, state, search.trim()),
          });
        }}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
    </div>
  );
}

function PullRequestListRow({
  isPinned,
  isSelected,
  item,
  onOpen,
  onTogglePin,
}: {
  isPinned: boolean;
  isSelected: boolean;
  item: GitHubPullRequestListItem;
  onOpen: () => void;
  onTogglePin: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <div
        className={cn(
          "flex items-start gap-1 px-2 py-2",
          isSelected && "bg-muted/60",
        )}
      >
        <button
          className="min-w-0 flex-1 rounded-md px-1 py-1 text-left hover:bg-muted/50"
          onClick={onOpen}
          type="button"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>#{item.number}</span>
            <span className="truncate">{item.state}</span>
            {item.isDraft ? (
              <span className="rounded bg-muted px-1 py-0.5">
                {t("common.draft")}
              </span>
            ) : null}
          </div>
          <div className="truncate text-sm font-medium">{item.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {item.headRefName} → {item.baseRefName} ·{" "}
            {formatRelativeTime(item.updatedAt)}
          </div>
        </button>
        <Button
          aria-label={isPinned ? t("common.unpin") : t("common.pin")}
          onClick={onTogglePin}
          size="icon-sm"
          variant="ghost"
        >
          <PushPin
            className={cn("size-4", isPinned && "text-primary")}
            weight={isPinned ? "fill" : "regular"}
          />
        </Button>
      </div>
    </li>
  );
}

function PullRequestDetailPanel({
  commentDraft,
  commentPending,
  detail,
  onCommentChange,
  onOpenWorkspace,
  onSubmitComment,
  workspacePending,
}: {
  commentDraft: string;
  commentPending: boolean;
  detail: GitHubPullRequestDetail;
  onCommentChange: (value: string) => void;
  onOpenWorkspace: () => void;
  onSubmitComment: () => void;
  workspacePending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 p-4">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            #{detail.number} · {detail.state}
            {detail.isDraft ? ` · ${t("common.draft")}` : ""}
          </div>
          <h2 className="text-base font-semibold">{detail.title}</h2>
          <p className="text-xs text-muted-foreground">
            {detail.headRefName} → {detail.baseRefName}
            {is.nonEmptyString(detail.author) ? ` · @${detail.author}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={workspacePending}
            onClick={onOpenWorkspace}
            size="sm"
          >
            {workspacePending ? (
              <SpinnerGap className="size-4 animate-spin" />
            ) : null}
            {t("pullRequests.openWorkspace")}
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={detail.url} rel="noreferrer" target="_blank">
              {t("pullRequests.openOnGitHub")}
            </a>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("pullRequests.description")}
          </h3>
          <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
            {detail.body.length > 0 ? detail.body : t("pullRequests.emptyBody")}
          </pre>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("pullRequests.comments", {
              count: detail.comments.length,
            })}
          </h3>
          {detail.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("pullRequests.noComments")}
            </p>
          ) : (
            <ul className="space-y-2">
              {detail.comments.map((comment) => (
                <li
                  className="rounded-md border border-border/50 p-3"
                  key={comment.id}
                >
                  <div className="mb-1 text-xs text-muted-foreground">
                    {is.nonEmptyString(comment.author)
                      ? `@${comment.author}`
                      : t("pullRequests.unknownAuthor")}{" "}
                    · {formatRelativeTime(comment.createdAt)}
                  </div>
                  <pre className="whitespace-pre-wrap text-sm">
                    {comment.body}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="border-t border-border/60 p-3">
        <Textarea
          onChange={(event) => onCommentChange(event.target.value)}
          placeholder={t("pullRequests.commentPlaceholder")}
          rows={3}
          value={commentDraft}
        />
        <div className="mt-2 flex justify-end">
          <Button
            disabled={commentPending || !is.nonEmptyString(commentDraft.trim())}
            onClick={onSubmitComment}
            size="sm"
          >
            {commentPending ? (
              <SpinnerGap className="size-4 animate-spin" />
            ) : null}
            {t("pullRequests.postComment")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof DaemonRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
