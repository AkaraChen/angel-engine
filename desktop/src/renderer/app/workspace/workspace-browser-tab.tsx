import type { DesignSelectionDraft } from "@/app/workspace/design-mode-send";
import type {
  WorkspaceBrowserDesignState,
  WorkspaceBrowserState,
} from "@shared/workspace-browser";
import type {
  WorkspaceToolSurfaceDynamicTab,
  WorkspaceToolSurfaceSnapshot,
} from "@shared/workspace-tool-surface";
import type { FormEvent } from "react";

import is from "@sindresorhus/is";
import {
  ArrowLeft,
  ArrowRight,
  CursorClick,
  Globe,
  LockSimple,
  ArrowClockwise as Refresh,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildDesignSendPackage } from "@/app/workspace/design-mode-send";
import { DesignModeSendPanel } from "@/app/workspace/design-mode-send-panel";
import {
  browserTitleFromUrl,
  normalizeWorkspaceBrowserUrl,
} from "@/app/workspace/workspace-browser-url";
import { WorkspaceBrowserNativeView } from "@/app/workspace/workspace-browser-view";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useSendChatMessage } from "@/features/chat/runtime/use-send-chat-message";
import { cn } from "@/platform/utils";

/**
 * Stands in for a favicon: the leading glyph says what kind of origin this is
 * rather than which site it is. Local dev servers -- the overwhelmingly common
 * case here -- are http and would otherwise wear a permanent warning.
 */
function workspaceBrowserSiteIcon(url: string) {
  const protocol = URL.parse(url)?.protocol;
  if (protocol === "https:" || protocol === undefined) {
    return LockSimple;
  }
  return protocol === "http:" ? Globe : WarningCircle;
}

export function WorkspaceBrowserTabContent({
  active,
  onBrowserTabChange,
  tab,
}: {
  active: boolean;
  onBrowserTabChange: (
    updater: (
      current: WorkspaceToolSurfaceSnapshot,
    ) => WorkspaceToolSurfaceSnapshot,
  ) => void;
  tab: Extract<WorkspaceToolSurfaceDynamicTab, { kind: "browser" }>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { chatId } = useWorkspaceToolSurface();
  const sendChatMessage = useSendChatMessage(
    chatId ?? "design-mode-no-session",
    {
      chatId: chatId ?? undefined,
    },
  );
  const [browserState, setBrowserState] = useState<WorkspaceBrowserState>({
    canGoBack: false,
    canGoForward: false,
    ready: false,
    title: tab.title,
    url: tab.url,
  });
  const [designState, setDesignState] = useState<WorkspaceBrowserDesignState>({
    active: false,
    allowed: false,
    origin: null,
  });
  const [selectionDraft, setSelectionDraft] =
    useState<DesignSelectionDraft | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const noActiveSessionMessage = useMemo(
    () =>
      "No active chat session. Open a chat in this workspace, then send the Design Mode selection.",
    [],
  );

  useEffect(() => {
    void window.workspaceBrowser
      .getState({ browserViewId: tab.browserViewId })
      .then(setBrowserState)
      .catch((error: unknown) => {
        console.error("Failed to get workspace browser state.", {
          browserViewId: tab.browserViewId,
          error,
          tabId: tab.id,
        });
      });
  }, [tab.browserViewId, tab.id]);

  useEffect(() => {
    let cancelled = false;
    const refreshDesignState = () => {
      void window.workspaceBrowser
        .getDesignState({ browserViewId: tab.browserViewId })
        .then((state) => {
          if (!cancelled) {
            setDesignState(state);
          }
        })
        .catch((error: unknown) => {
          console.error("Failed to get workspace browser design state.", {
            browserViewId: tab.browserViewId,
            error,
            tabId: tab.id,
          });
        });
    };

    refreshDesignState();
    const unsubscribe = window.workspaceBrowser.onDesignEvent(
      tab.browserViewId,
      (event) => {
        if (event.type === "started") {
          setDesignState((current) => ({
            ...current,
            active: true,
            allowed: true,
            origin: event.origin || current.origin,
          }));
          return;
        }
        if (event.type === "stopped") {
          setDesignState((current) => ({
            ...current,
            active: false,
            origin: event.origin || current.origin,
          }));
          setSelectionDraft(null);
          setSendError(null);
          return;
        }
        if (event.type === "error") {
          refreshDesignState();
          return;
        }
        if (event.type === "selection") {
          setSendError(null);
          setSelectionDraft({
            anchor: event.anchor,
            browserViewId: event.browserViewId,
            changes: event.changes,
            element: event.element,
            origin: event.origin,
            pageUrl: browserState.url || tab.url,
          });
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [browserState.url, tab.browserViewId, tab.id, tab.url]);

  const updateBrowserTab = useCallback(
    (
      updater: (
        current: Extract<WorkspaceToolSurfaceDynamicTab, { kind: "browser" }>,
      ) => Extract<WorkspaceToolSurfaceDynamicTab, { kind: "browser" }>,
    ) => {
      onBrowserTabChange((current) => ({
        ...current,
        tabs: current.tabs.map((candidate) =>
          candidate.id === tab.id && candidate.kind === "browser"
            ? updater(candidate)
            : candidate,
        ),
      }));
    },
    [onBrowserTabChange, tab.id],
  );
  const handleStateChange = useCallback(
    (state: WorkspaceBrowserState) => {
      setBrowserState(state);
      updateBrowserTab((current) => ({
        ...current,
        draftUrl: state.url || current.draftUrl,
        title: state.title.trim() || browserTitleFromUrl(state.url),
        url: state.url || current.url,
      }));
      void window.workspaceBrowser
        .getDesignState({ browserViewId: tab.browserViewId })
        .then(setDesignState)
        .catch(() => {
          // Design state is advisory for the toolbar button; browse still works.
        });
    },
    [tab.browserViewId, updateBrowserTab],
  );
  const updateDraftUrl = useCallback(
    (draftUrl: string) => {
      updateBrowserTab((current) => ({ ...current, draftUrl }));
    },
    [updateBrowserTab],
  );
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextUrl = normalizeWorkspaceBrowserUrl(tab.draftUrl);

      updateBrowserTab((current) => ({
        ...current,
        draftUrl: nextUrl,
        title: browserTitleFromUrl(nextUrl),
        url: nextUrl,
      }));
      setBrowserState((current) => ({
        ...current,
        title: browserTitleFromUrl(nextUrl),
        url: nextUrl,
      }));
      void window.workspaceBrowser
        .navigate({ browserViewId: tab.browserViewId, url: nextUrl })
        .then(handleStateChange)
        .catch((error: unknown) => {
          console.error("Failed to navigate workspace browser.", {
            browserViewId: tab.browserViewId,
            error,
            tabId: tab.id,
            url: nextUrl,
          });
        });
    },
    [
      handleStateChange,
      tab.browserViewId,
      tab.draftUrl,
      tab.id,
      updateBrowserTab,
    ],
  );
  const goBack = useCallback(() => {
    void window.workspaceBrowser
      .goBack({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch((error: unknown) => {
        console.error("Failed to navigate workspace browser back.", {
          browserViewId: tab.browserViewId,
          error,
          tabId: tab.id,
        });
      });
  }, [handleStateChange, tab.browserViewId, tab.id]);
  const goForward = useCallback(() => {
    void window.workspaceBrowser
      .goForward({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch((error: unknown) => {
        console.error("Failed to navigate workspace browser forward.", {
          browserViewId: tab.browserViewId,
          error,
          tabId: tab.id,
        });
      });
  }, [handleStateChange, tab.browserViewId, tab.id]);
  const reload = useCallback(() => {
    void window.workspaceBrowser
      .reload({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch((error: unknown) => {
        console.error("Failed to reload workspace browser.", {
          browserViewId: tab.browserViewId,
          error,
          tabId: tab.id,
        });
      });
  }, [handleStateChange, tab.browserViewId, tab.id]);
  const toggleDesignMode = useCallback(() => {
    if (!designState.allowed && !designState.active) {
      return;
    }

    const input = { browserViewId: tab.browserViewId };
    if (designState.active) {
      void window.workspaceBrowser
        .stopDesignMode(input)
        .then(setDesignState)
        .catch((error: unknown) => {
          console.error("Failed to stop Design Mode.", {
            browserViewId: tab.browserViewId,
            error,
            tabId: tab.id,
          });
        });
      return;
    }

    void window.workspaceBrowser
      .startDesignMode(input)
      .then((result) => {
        setDesignState(result.state);
      })
      .catch((error: unknown) => {
        console.error("Failed to start Design Mode.", {
          browserViewId: tab.browserViewId,
          error,
          tabId: tab.id,
        });
      });
  }, [designState.active, designState.allowed, tab.browserViewId, tab.id]);

  const clearSelectionDraft = useCallback(() => {
    setSelectionDraft(null);
    setSendError(null);
  }, []);

  const handleDesignSend = useCallback(
    async ({
      userAttachments,
      userText,
    }: {
      userAttachments: Parameters<
        typeof buildDesignSendPackage
      >[0]["userAttachments"];
      userText: string;
    }) => {
      if (!selectionDraft) {
        return;
      }

      if (!is.nonEmptyString(chatId)) {
        setSendError(noActiveSessionMessage);
        toast({
          description: noActiveSessionMessage,
          title: "Cannot send Design Mode selection",
          variant: "destructive",
        });
        return;
      }

      setSending(true);
      setSendError(null);
      try {
        const capture = await window.workspaceBrowser.captureDesignScreenshot({
          browserViewId: tab.browserViewId,
        });
        if (!capture.ok) {
          throw new Error(capture.message);
        }

        const pageUrl =
          browserState.url || selectionDraft.pageUrl || selectionDraft.origin;
        const packed = await buildDesignSendPackage({
          screenshot: capture.screenshot,
          selection: {
            ...selectionDraft,
            pageUrl,
          },
          userAttachments: userAttachments ?? [],
          userText,
        });

        await sendChatMessage.sendPromptMessage({
          attachments: packed.attachments,
          mentionedFiles: [],
          selectedSkills: [],
          t,
          text: packed.text,
        });

        setSelectionDraft(null);
        toast({
          title: "Selection sent to chat",
          variant: "default",
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to send Design Mode selection.";
        setSendError(message);
        toast({
          description: message,
          title: "Design Mode send failed",
          variant: "destructive",
        });
      } finally {
        setSending(false);
      }
    },
    [
      browserState.url,
      chatId,
      noActiveSessionMessage,
      selectionDraft,
      sendChatMessage,
      t,
      tab.browserViewId,
      toast,
    ],
  );

  const SiteIcon = workspaceBrowserSiteIcon(tab.url);
  const designModeDisabled = !designState.active && !designState.allowed;
  const designModeTitle = designState.active
    ? "Exit Design Mode"
    : designState.allowed
      ? "Enter Design Mode"
      : "Design Mode is only available on localhost and registered preview origins";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="
          relative flex h-9 shrink-0 items-center gap-1 border-b
          border-border-subtle px-2
        "
        onSubmit={handleSubmit}
      >
        <Button
          aria-label={t("workspace.browser.back")}
          className="active:bg-overlay-active"
          disabled={!browserState.canGoBack}
          onClick={goBack}
          size="icon-xs"
          title={t("workspace.browser.back")}
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label={t("workspace.browser.forward")}
          className="active:bg-overlay-active"
          disabled={!browserState.canGoForward}
          onClick={goForward}
          size="icon-xs"
          title={t("workspace.browser.forward")}
          type="button"
          variant="ghost"
        >
          <ArrowRight />
        </Button>
        {/*
          The address bar is one of the three places the DNA capsule survives
          into app context -- it is a search field in everything but name.
        */}
        <div
          className="
            group/address relative flex h-7 min-w-0 flex-1 items-center
            rounded-full border border-input bg-surface-1
            transition-[border-color,box-shadow] duration-150 ease-standard
            focus-within:border-primary focus-within:ring-2
            focus-within:ring-ring/45
            motion-reduce:transition-none
          "
        >
          <SiteIcon
            aria-hidden="true"
            className="ml-2.5 size-3.5 shrink-0 text-muted-foreground"
            weight="regular"
          />
          <Input
            aria-label={t("workspace.browser.urlLabel")}
            className="
              h-7 rounded-full border-transparent bg-transparent px-2 font-mono
              text-xs select-text
              focus-visible:border-transparent focus-visible:ring-0
            "
            onChange={(event) => updateDraftUrl(event.currentTarget.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                updateDraftUrl(tab.url);
                event.currentTarget.blur();
              }
            }}
            value={tab.draftUrl}
          />
          <Button
            aria-label={t("common.reload")}
            className="
              mr-0.5 shrink-0 rounded-full
              active:bg-overlay-active
            "
            disabled={!browserState.ready}
            onClick={reload}
            size="icon-xs"
            title={t("common.reload")}
            type="button"
            variant="ghost"
          >
            <Refresh />
          </Button>
        </div>
        <Button
          aria-label={designModeTitle}
          aria-pressed={designState.active}
          className={cn(
            "shrink-0 active:bg-overlay-active",
            designState.active && "bg-overlay-active text-primary",
          )}
          disabled={designModeDisabled}
          onClick={toggleDesignMode}
          size="icon-xs"
          title={designModeTitle}
          type="button"
          variant="ghost"
        >
          <CursorClick weight={designState.active ? "fill" : "regular"} />
        </Button>
        {browserState.ready ? null : (
          // No animated gradient: the rail is either there or it is not.
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-0.5 bg-primary"
          />
        )}
      </form>
      {selectionDraft ? (
        <DesignModeSendPanel
          busy={sending}
          error={sendError}
          onCancel={clearSelectionDraft}
          onSend={handleDesignSend}
          selection={selectionDraft}
        />
      ) : null}
      <WorkspaceBrowserNativeView
        active={active}
        browserViewId={tab.browserViewId}
        key={tab.browserViewId}
        onStateChange={handleStateChange}
        url={tab.url}
      />
    </div>
  );
}
