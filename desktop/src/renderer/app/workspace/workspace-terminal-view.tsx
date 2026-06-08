import type { TerminalSessionController } from "@shared/terminal";
import type { ITheme } from "@xterm/xterm";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

const pierreTerminalThemes = {
  dark: {
    black: "#171717",
    blue: "#009fff",
    brightBlack: "#171717",
    brightBlue: "#009fff",
    brightCyan: "#08c0ef",
    brightGreen: "#86c427",
    brightMagenta: "#e130ac",
    brightRed: "#ff2e3f",
    brightWhite: "#bcbcbc",
    brightYellow: "#ffca00",
    cursor: "#69b1ff",
    cyan: "#08c0ef",
    foreground: "#8a8a8a",
    green: "#0dbe4e",
    magenta: "#e130ac",
    red: "#ff2e3f",
    selectionBackground: "#1f3e5e",
    white: "#bcbcbc",
    yellow: "#ffca00",
  },
  light: {
    black: "#1d1d1d",
    blue: "#009fff",
    brightBlack: "#1d1d1d",
    brightBlue: "#009fff",
    brightCyan: "#08c0ef",
    brightGreen: "#86c427",
    brightMagenta: "#e130ac",
    brightRed: "#ff2e3f",
    brightWhite: "#bcbcbc",
    brightYellow: "#ffca00",
    cursor: "#009fff",
    cyan: "#08c0ef",
    foreground: "#737373",
    green: "#0dbe4e",
    magenta: "#e130ac",
    red: "#ff2e3f",
    selectionBackground: "#dfebff",
    white: "#bcbcbc",
    yellow: "#ffca00",
  },
} satisfies Record<"dark" | "light", ITheme>;

interface WorkspaceTerminalInstance {
  animationFrame: number;
  controller: TerminalSessionController;
  dataDisposable: { dispose: () => void };
  resizeObserver: ResizeObserver;
  terminal: Terminal;
  themeObserver: MutationObserver;
}

export function WorkspaceTerminalView({
  autoFocus,
  root,
  sessionId,
}: {
  autoFocus: boolean;
  root: string;
  sessionId: string;
}) {
  const instanceRef = useRef<WorkspaceTerminalInstance | null>(null);
  const autoFocusRef = useRef(autoFocus);
  autoFocusRef.current = autoFocus;
  const setContainer = useCallback(
    (container: HTMLDivElement | null) => {
      disposeWorkspaceTerminalInstance(instanceRef.current);
      instanceRef.current = null;

      if (!container) {
        return;
      }

      const terminal = new Terminal({
        allowProposedApi: false,
        convertEol: true,
        cursorBlink: true,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
        fontSize: 12,
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

      const controller = window.terminal.create(
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
          if (event.type === "error") {
            terminal.writeln(`\r\n${event.message}`);
            return;
          }
          terminal.writeln("\r\nProcess exited.");
        },
      );
      const dataDisposable = terminal.onData((data) => controller.write(data));
      const resizeObserver = new ResizeObserver(() => {
        fitTerminal(fitAddon, terminal, controller);
      });
      resizeObserver.observe(container);
      const animationFrame = window.requestAnimationFrame(() => {
        fitTerminal(fitAddon, terminal, controller);
        if (autoFocusRef.current) {
          terminal.focus();
        }
      });

      instanceRef.current = {
        animationFrame,
        controller,
        dataDisposable,
        resizeObserver,
        terminal,
        themeObserver,
      };
    },
    [root, sessionId],
  );

  return <div className="h-full min-h-0 overflow-hidden" ref={setContainer} />;
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
  instance.controller.dispose();
  instance.terminal.dispose();
}

function getWorkspaceTerminalTheme() {
  return {
    ...(document.documentElement.classList.contains("dark")
      ? pierreTerminalThemes.dark
      : pierreTerminalThemes.light),
    background: getWorkspaceBackgroundColor(),
  };
}

function getWorkspaceBackgroundColor() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim() || "transparent"
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
  } catch {
    return;
  }
}
