import type { TerminalSessionController } from "@angel-engine/daemon-api/terminal";
import type { ReactNode } from "react";

import { ChatCircleDots, Copy } from "@phosphor-icons/react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveWorkspaceTerminalTheme } from "@/app/workspace/workspace-terminal-theme";
import {
  hasTerminalSelection,
  publishTerminalSelectionInsert,
} from "@/features/chat/components/composer/terminal-selection-to-composer";
import { cn } from "@/platform/utils";
import { terminalClient } from "@/platform/terminal-client";
import "@xterm/xterm/css/xterm.css";

interface WorkspaceTerminalInstance {
  animationFrame: number;
  controller: TerminalSessionController;
  dataDisposable: { dispose: () => void };
  resizeObserver: ResizeObserver;
  scrollDisposable: { dispose: () => void };
  selectionDisposable: { dispose: () => void };
  terminal: Terminal;
  themeObserver: MutationObserver;
}

interface TerminalSelectionMenuState {
  left: number;
  placement: "above" | "below";
  selection: string;
  top: number;
}

export function WorkspaceTerminalView({
  focusOnMount,
  root,
  sessionId,
}: {
  focusOnMount: boolean;
  root: string;
  sessionId: string;
}) {
  const { t } = useTranslation();
  const instanceRef = useRef<WorkspaceTerminalInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<TerminalSelectionMenuState | null>(null);
  const focusOnMountRef = useRef(focusOnMount);
  focusOnMountRef.current = focusOnMount;
  const refreshMenu = useCallback(() => {
    const terminal = instanceRef.current?.terminal;
    const container = containerRef.current;
    if (terminal === undefined || container === null) {
      setMenu(null);
      return;
    }
    setMenu(readTerminalSelectionMenu(terminal, container));
  }, []);
  const setContainer = useCallback(
    (container: HTMLDivElement | null) => {
      disposeWorkspaceTerminalInstance(instanceRef.current);
      instanceRef.current = null;
      containerRef.current = container;

      if (!container) {
        setMenu(null);
        return;
      }

      const terminal = new Terminal({
        allowProposedApi: false,
        convertEol: true,
        cursorBlink: true,
        fontFamily: getWorkspaceTerminalFontFamily(),
        fontSize: 12,
        lineHeight: 1.4,
        scrollback: 5000,
        theme: getWorkspaceTerminalTheme(),
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(container);
      fitAddon.fit();
      const themeObserver = new MutationObserver(() => {
        terminal.options.theme = getWorkspaceTerminalTheme();
      });
      themeObserver.observe(document.documentElement, {
        attributeFilter: ["class"],
        attributes: true,
      });
      let replayWriteDepth = 0;

      const controller = terminalClient.create(
        {
          cols: terminal.cols,
          cwd: root,
          rows: terminal.rows,
          sessionId,
        },
        (event) => {
          if (event.type === "data") {
            terminal.write(event.data);
            return;
          }
          if (event.type === "replay") {
            replayWriteDepth += 1;
            terminal.write(event.data, () => {
              replayWriteDepth = Math.max(0, replayWriteDepth - 1);
            });
            return;
          }
          if (event.type === "error") {
            terminal.writeln(`\r\n${event.message}`);
            return;
          }
          terminal.writeln("\r\nProcess exited.");
        },
      );
      const dataDisposable = terminal.onData((data) => {
        if (replayWriteDepth > 0) {
          return;
        }
        controller.write(data);
      });
      const selectionDisposable = terminal.onSelectionChange(() => {
        refreshMenu();
      });
      // Scrolling moves the selected rows under the viewport, so the menu has
      // to follow them or disappear once they leave.
      const scrollDisposable = terminal.onScroll(() => {
        refreshMenu();
      });
      const resizeObserver = new ResizeObserver(() => {
        fitTerminal(fitAddon, terminal, controller);
        refreshMenu();
      });
      resizeObserver.observe(container);
      const animationFrame = window.requestAnimationFrame(() => {
        fitTerminal(fitAddon, terminal, controller);
        if (focusOnMountRef.current) {
          terminal.focus();
        }
      });

      instanceRef.current = {
        animationFrame,
        controller,
        dataDisposable,
        resizeObserver,
        scrollDisposable,
        selectionDisposable,
        terminal,
        themeObserver,
      };
    },
    [refreshMenu, root, sessionId],
  );

  const addSelectionToChat = useCallback(() => {
    // Prefer the live xterm selection so a stale React snapshot cannot send an
    // empty or outdated range after the last selection-change event.
    const terminal = instanceRef.current?.terminal;
    const liveSelection = terminal?.getSelection() ?? menu?.selection ?? "";
    publishTerminalSelectionInsert({ cwd: root, selection: liveSelection });
    terminal?.clearSelection();
  }, [menu, root]);
  const copySelection = useCallback(() => {
    const terminal = instanceRef.current?.terminal;
    const liveSelection = terminal?.getSelection() ?? menu?.selection ?? "";
    if (!hasTerminalSelection(liveSelection)) return;
    void navigator.clipboard.writeText(liveSelection);
    terminal?.clearSelection();
  }, [menu]);

  // The terminal ground is `--card`, not the page, and it runs edge to edge:
  // the padding is inside the scroll surface so nothing frames it.
  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-card">
      <div className="h-full px-2 py-1.5" ref={setContainer} />
      {menu === null ? null : (
        <div
          className={cn(
            `
              absolute z-10 flex -translate-x-1/2 items-center gap-0.5
              rounded-lg border border-border-subtle bg-popover p-0.5
              text-popover-foreground shadow-md
            `,
            menu.placement === "above" ? "-translate-y-full" : "translate-y-0",
          )}
          // Anchored to the live selection rectangle, which only exists at
          // runtime — there is no static class for these coordinates.
          style={{ left: menu.left, top: menu.top }}
        >
          <TerminalSelectionMenuItem
            icon={<ChatCircleDots className="size-3.5" />}
            label={t("workspace.tools.addToChat")}
            onClick={addSelectionToChat}
          />
          <TerminalSelectionMenuItem
            icon={<Copy className="size-3.5" />}
            label={t("common.copy")}
            onClick={copySelection}
          />
        </div>
      )}
    </div>
  );
}

function TerminalSelectionMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="
        inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs
        font-medium whitespace-nowrap
        hover:bg-overlay-hover
        active:bg-overlay-active
      "
      onClick={onClick}
      // The terminal clears its selection on mousedown elsewhere; keeping the
      // default suppressed lets the click read the still-live selection.
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function readTerminalSelectionMenu(
  terminal: Terminal,
  container: HTMLElement,
): TerminalSelectionMenuState | null {
  const selection = terminal.getSelection();
  if (!hasTerminalSelection(selection)) return null;

  const position = terminal.getSelectionPosition();
  const screen = terminal.element?.querySelector(".xterm-screen");
  if (position === undefined || !(screen instanceof HTMLElement)) return null;

  const cellWidth = screen.clientWidth / terminal.cols;
  const cellHeight = screen.clientHeight / terminal.rows;
  const viewportY = terminal.buffer.active.viewportY;
  const startRow = position.start.y - viewportY;
  const endRow = position.end.y - viewportY;
  // Scrolled fully out of view: there is nothing left to anchor to.
  if (endRow < 0 || startRow > terminal.rows - 1) return null;

  const screenRect = screen.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const offsetLeft = screenRect.left - containerRect.left;
  const offsetTop = screenRect.top - containerRect.top;
  const centerColumn =
    startRow === endRow
      ? (position.start.x + position.end.x) / 2
      : terminal.cols / 2;
  const menuGap = 6;
  const placement = startRow >= 1 ? "above" : "below";
  const anchorRow = placement === "above" ? startRow : endRow + 1;
  const left = clamp(
    offsetLeft + centerColumn * cellWidth,
    60,
    Math.max(60, containerRect.width - 60),
  );
  const top =
    offsetTop +
    anchorRow * cellHeight +
    (placement === "above" ? -menuGap : menuGap);

  return { left, placement, selection, top };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function disposeWorkspaceTerminalInstance(
  instance: WorkspaceTerminalInstance | null,
) {
  if (!instance) {
    return;
  }

  window.cancelAnimationFrame(instance.animationFrame);
  instance.themeObserver.disconnect();
  instance.resizeObserver.disconnect();
  instance.dataDisposable.dispose();
  instance.selectionDisposable.dispose();
  instance.scrollDisposable.dispose();
  instance.controller.dispose();
  instance.terminal.dispose();
}

function getWorkspaceTerminalTheme() {
  return resolveWorkspaceTerminalTheme(
    document.documentElement.classList.contains("dark"),
  );
}

function getWorkspaceTerminalFontFamily() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--app-font-mono")
      .trim() || "ui-monospace, SFMono-Regular, monospace"
  );
}

function fitTerminal(
  fitAddon: FitAddon,
  terminal: Terminal,
  controller: TerminalSessionController,
) {
  try {
    fitAddon.fit();
    controller.resize({ cols: terminal.cols, rows: terminal.rows });
  } catch {}
}
