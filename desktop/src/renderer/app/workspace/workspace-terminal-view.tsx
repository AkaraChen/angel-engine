import type { TerminalSessionController } from "@shared/terminal";
import type { ITheme } from "@xterm/xterm";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

const vitesseTerminalThemes = {
  dark: {
    black: "#393a34",
    blue: "#6394bf",
    brightBlack: "#777777",
    brightBlue: "#6394bf",
    brightCyan: "#5eaab5",
    brightGreen: "#5aa385",
    brightMagenta: "#d9739f",
    brightRed: "#cb7676",
    brightWhite: "#ffffff",
    brightYellow: "#e6cc77",
    cursor: "#4d9375",
    cyan: "#5eaab5",
    foreground: "#dbd7caee",
    green: "#4d9375",
    magenta: "#d9739f",
    red: "#cb7676",
    selectionBackground: "#4d937538",
    white: "#dbd7ca",
    yellow: "#e6cc77",
  },
  light: {
    black: "#121212",
    blue: "#296aa3",
    brightBlack: "#aaaaaa",
    brightBlue: "#296aa3",
    brightCyan: "#2993a3",
    brightGreen: "#2f7d57",
    brightMagenta: "#a13865",
    brightRed: "#ab5959",
    brightWhite: "#dddddd",
    brightYellow: "#bda437",
    cursor: "#1c6b48",
    cyan: "#2993a3",
    foreground: "#393a34",
    green: "#1e754f",
    magenta: "#a13865",
    red: "#ab5959",
    selectionBackground: "#1c6b4824",
    white: "#dbd7ca",
    yellow: "#bda437",
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
  focusOnMount,
  root,
  sessionId,
}: {
  focusOnMount: boolean;
  root: string;
  sessionId: string;
}) {
  const instanceRef = useRef<WorkspaceTerminalInstance | null>(null);
  const focusOnMountRef = useRef(focusOnMount);
  focusOnMountRef.current = focusOnMount;
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
      let replayWriteDepth = 0;

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
      const resizeObserver = new ResizeObserver(() => {
        fitTerminal(fitAddon, terminal, controller);
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
      ? vitesseTerminalThemes.dark
      : vitesseTerminalThemes.light),
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
  } catch {}
}
