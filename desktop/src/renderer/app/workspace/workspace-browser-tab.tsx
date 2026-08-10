import type {
  WorkspaceBrowserError,
  WorkspaceBrowserErrorCode,
  WorkspaceBrowserState,
} from "@shared/workspace-browser";
import type {
  WorkspaceToolSurfaceDynamicTab,
  WorkspaceToolSurfaceSnapshot,
} from "@shared/workspace-tool-surface";
import type { FormEvent } from "react";

import {
  ArrowLeft,
  ArrowRight,
  Globe,
  LockSimple,
  ArrowClockwise as Refresh,
  WarningCircle,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  browserTitleFromUrl,
  normalizeWorkspaceBrowserUrl,
} from "@/app/workspace/workspace-browser-url";
import { WorkspaceBrowserNativeView } from "@/app/workspace/workspace-browser-view";
import { RecoveryState } from "@/components/recovery-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BROWSER_ERROR_KEYS: Record<
  WorkspaceBrowserErrorCode,
  | "workspace.browser.errors.navigationFailed"
  | "workspace.browser.errors.offline"
  | "workspace.browser.errors.unknown"
  | "workspace.browser.errors.unsupportedUrl"
> = {
  navigation_failed: "workspace.browser.errors.navigationFailed",
  offline: "workspace.browser.errors.offline",
  unknown: "workspace.browser.errors.unknown",
  unsupported_url: "workspace.browser.errors.unsupportedUrl",
};

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

function emptyBrowserState(tab: {
  title: string;
  url: string;
}): WorkspaceBrowserState {
  return {
    canGoBack: false,
    canGoForward: false,
    error: null,
    loading: false,
    ready: false,
    title: tab.title,
    url: tab.url,
  };
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
  const [browserState, setBrowserState] = useState<WorkspaceBrowserState>(() =>
    emptyBrowserState(tab),
  );
  const [clientError, setClientError] = useState<WorkspaceBrowserError | null>(
    null,
  );

  useEffect(() => {
    void window.workspaceBrowser
      .getState({ browserViewId: tab.browserViewId })
      .then((state) => {
        setBrowserState(state);
        setClientError(null);
      })
      .catch(() => {
        setClientError({ code: "unknown" });
      });
  }, [tab.browserViewId, tab.id]);

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
      setClientError(null);
      updateBrowserTab((current) => ({
        ...current,
        draftUrl: state.url || current.draftUrl,
        title: state.title.trim() || browserTitleFromUrl(state.url),
        url: state.url || current.url,
      }));
    },
    [updateBrowserTab],
  );
  const handleClientFailure = useCallback((error: WorkspaceBrowserError) => {
    setClientError(error);
  }, []);
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
      setClientError(null);
      setBrowserState((current) => ({
        ...current,
        error: null,
        loading: true,
        ready: false,
        title: browserTitleFromUrl(nextUrl),
        url: nextUrl,
      }));
      void window.workspaceBrowser
        .navigate({ browserViewId: tab.browserViewId, url: nextUrl })
        .then(handleStateChange)
        .catch(() => {
          setClientError({
            code: "navigation_failed",
            url: nextUrl,
          });
        });
    },
    [handleStateChange, tab.browserViewId, tab.draftUrl, updateBrowserTab],
  );
  const goBack = useCallback(() => {
    void window.workspaceBrowser
      .goBack({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch(() => {
        setClientError({ code: "navigation_failed", url: tab.url });
      });
  }, [handleStateChange, tab.browserViewId, tab.url]);
  const goForward = useCallback(() => {
    void window.workspaceBrowser
      .goForward({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch(() => {
        setClientError({ code: "navigation_failed", url: tab.url });
      });
  }, [handleStateChange, tab.browserViewId, tab.url]);
  const reload = useCallback(() => {
    setClientError(null);
    void window.workspaceBrowser
      .reload({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch(() => {
        setClientError({ code: "navigation_failed", url: tab.url });
      });
  }, [handleStateChange, tab.browserViewId, tab.url]);

  const activeError = clientError ?? browserState.error;
  const activeUrl = activeError?.url ?? (browserState.url || tab.url);
  const isLoading = browserState.loading && activeError === null;

  const recoveryActions = useMemo(() => {
    const actions = [
      {
        label: t("workspace.browser.retry"),
        onClick: reload,
        primary: true,
        testId: "workspace-browser-retry",
      },
    ];
    if (is.nonEmptyString(activeUrl) && activeUrl !== "about:blank") {
      actions.push({
        label: t("workspace.browser.openExternally"),
        onClick: () => {
          void window.workspaceBrowser
            .openExternal({ url: activeUrl })
            .catch(() => {
              setClientError({ code: "unknown", url: activeUrl });
            });
        },
        primary: false,
        testId: "workspace-browser-open-external",
      });
      actions.push({
        label: t("workspace.browser.copyUrl"),
        onClick: () => {
          void navigator.clipboard.writeText(activeUrl).catch(() => {
            // Clipboard denial is non-fatal; the URL remains visible.
          });
        },
        primary: false,
        testId: "workspace-browser-copy-url",
      });
    }
    if (browserState.canGoBack) {
      actions.push({
        label: t("workspace.browser.back"),
        onClick: goBack,
        primary: false,
        testId: "workspace-browser-error-back",
      });
    }
    return actions;
  }, [activeUrl, browserState.canGoBack, goBack, reload, t]);

  const SiteIcon = workspaceBrowserSiteIcon(tab.url);
  const loadingLabel = t("workspace.browser.loading");

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
          aria-label="Forward"
          className="active:bg-overlay-active"
          disabled={!browserState.canGoForward}
          onClick={goForward}
          size="icon-xs"
          title="Forward"
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
            aria-label="URL"
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
            disabled={isLoading}
            onClick={reload}
            size="icon-xs"
            title={t("common.reload")}
            type="button"
            variant="ghost"
          >
            <Refresh />
          </Button>
        </div>
        {isLoading ? (
          // Visual rail plus a single live announcement; no fake progress.
          <>
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-0.5 bg-primary"
            />
            <span className="sr-only" role="status">
              {loadingLabel}
            </span>
          </>
        ) : null}
      </form>
      <div className="relative min-h-0 flex-1">
        <WorkspaceBrowserNativeView
          active={active}
          browserViewId={tab.browserViewId}
          className={activeError !== null ? "invisible" : undefined}
          key={tab.browserViewId}
          onFailure={handleClientFailure}
          onStateChange={handleStateChange}
          url={tab.url}
        />
        {activeError !== null ? (
          <div className="absolute inset-0 overflow-y-auto bg-background">
            <RecoveryState
              actions={recoveryActions}
              className="h-full"
              description={t("workspace.browser.loadFailedDescription")}
              detail={
                is.nonEmptyString(activeError.detail)
                  ? `${t(BROWSER_ERROR_KEYS[activeError.code])} · ${activeError.detail}`
                  : t(BROWSER_ERROR_KEYS[activeError.code])
              }
              title={t("workspace.browser.loadFailedTitle")}
              variant={activeError.code === "offline" ? "offline" : "error"}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
