import type { WorkspaceBrowserState } from "@shared/workspace-browser";

import {
  RiArrowLeftLine as ArrowLeft,
  RiArrowRightLine as ArrowRight,
  RiRefreshLine as Refresh,
} from "@remixicon/react";
import { type FormEvent, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/platform/utils";

export function WorkspaceBrowserNativeView({
  active,
  browserViewId,
  className,
  onStateChange,
  url,
}: {
  active: boolean;
  browserViewId: string;
  className?: string;
  onStateChange?: (state: WorkspaceBrowserState) => void;
  url: string;
}) {
  const cleanupRef = useRef<() => void>(() => {});
  const propsRef = useRef({ browserViewId, onStateChange, url });
  propsRef.current = { browserViewId, onStateChange, url };

  const setContainer = useCallback(
    (container: HTMLDivElement | null) => {
      cleanupRef.current();
      cleanupRef.current = () => {};

      if (!container) {
        return;
      }

      const attachmentId = crypto.randomUUID();
      let disposed = false;
      const currentProps = propsRef.current;
      const emitState = (state: WorkspaceBrowserState) => {
        propsRef.current.onStateChange?.(state);
      };
      const updateBounds = () => {
        const bounds = readWorkspaceBrowserBounds(container);
        void window.workspaceBrowser.setBounds({
          attachmentId,
          bounds,
          browserViewId: currentProps.browserViewId,
        });
      };
      const unsubscribe = window.workspaceBrowser.onEvent(
        currentProps.browserViewId,
        (event) => {
          emitState(event.state);
        },
      );
      const resizeObserver = new ResizeObserver(updateBounds);

      resizeObserver.observe(container);
      void window.workspaceBrowser
        .create({
          browserViewId: currentProps.browserViewId,
          url: currentProps.url,
        })
        .then((state) => {
          if (disposed) {
            return;
          }
          emitState(state);
          return window.workspaceBrowser.attach({
            attachmentId,
            bounds: readWorkspaceBrowserBounds(container),
            browserViewId: currentProps.browserViewId,
          });
        })
        .then((state) => {
          if (!disposed && state) {
            emitState(state);
          }
        })
        .catch((error) => {
          console.error("Failed to attach workspace browser view.", {
            browserViewId: currentProps.browserViewId,
            error,
          });
        });

      cleanupRef.current = () => {
        disposed = true;
        resizeObserver.disconnect();
        unsubscribe();
        void window.workspaceBrowser
          .detach({
            attachmentId,
            browserViewId: currentProps.browserViewId,
          })
          .catch((error) => {
            console.error("Failed to detach workspace browser view.", {
              browserViewId: currentProps.browserViewId,
              error,
            });
          });
      };
    },
    [browserViewId],
  );

  return (
    <div
      className={cn(
        "h-full min-h-0 w-full overflow-hidden bg-background",
        className,
      )}
      ref={active ? setContainer : undefined}
    />
  );
}

export function WorkspaceBrowserToolView({
  active = true,
  browserViewId,
  initialUrl,
}: {
  active?: boolean;
  browserViewId: string;
  initialUrl: string;
}) {
  const [browserState, setBrowserState] = useState<WorkspaceBrowserState>({
    canGoBack: false,
    canGoForward: false,
    ready: false,
    title: browserTitleFromUrl(initialUrl),
    url: initialUrl,
  });
  const [draftUrl, setDraftUrl] = useState(initialUrl);
  const handleStateChange = useCallback((state: WorkspaceBrowserState) => {
    setBrowserState(state);
    setDraftUrl(state.url);
  }, []);
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextUrl = normalizeWorkspaceBrowserUrl(draftUrl);
      setDraftUrl(nextUrl);
      setBrowserState((current) => ({
        ...current,
        title: browserTitleFromUrl(nextUrl),
        url: nextUrl,
      }));
      void window.workspaceBrowser.navigate({ browserViewId, url: nextUrl });
    },
    [browserViewId, draftUrl],
  );
  const goBack = useCallback(() => {
    void window.workspaceBrowser
      .goBack({ browserViewId })
      .then(handleStateChange);
  }, [browserViewId, handleStateChange]);
  const goForward = useCallback(() => {
    void window.workspaceBrowser
      .goForward({ browserViewId })
      .then(handleStateChange);
  }, [browserViewId, handleStateChange]);
  const reload = useCallback(() => {
    void window.workspaceBrowser
      .reload({ browserViewId })
      .then(handleStateChange);
  }, [browserViewId, handleStateChange]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-2"
        onSubmit={handleSubmit}
      >
        <Button
          aria-label="Back"
          disabled={!browserState.canGoBack}
          onClick={goBack}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label="Forward"
          disabled={!browserState.canGoForward}
          onClick={goForward}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ArrowRight />
        </Button>
        <Button
          aria-label="Reload"
          disabled={!browserState.ready}
          onClick={reload}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Refresh />
        </Button>
        <Input
          aria-label="URL"
          className="h-7 rounded-md px-2 text-xs"
          onChange={(event) => setDraftUrl(event.currentTarget.value)}
          value={draftUrl}
        />
      </form>
      <WorkspaceBrowserNativeView
        active={active}
        browserViewId={browserViewId}
        onStateChange={handleStateChange}
        url={browserState.url}
      />
    </div>
  );
}

export function normalizeWorkspaceBrowserUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";
  if (trimmed === "about:blank") return trimmed;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function browserTitleFromUrl(url: string) {
  const trimmedUrl = url.trim();

  if (!trimmedUrl || trimmedUrl === "about:blank") {
    return "Blank";
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    return parsedUrl.host || parsedUrl.href;
  } catch {
    return trimmedUrl;
  }
}

function readWorkspaceBrowserBounds(container: HTMLElement) {
  const rect = container.getBoundingClientRect();

  return {
    height: Math.max(1, Math.round(rect.height)),
    width: Math.max(1, Math.round(rect.width)),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
  };
}
