import type { TerminalSessionController } from "@angel-engine/daemon-api/terminal";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveWorkspaceTerminalTheme } from "@/app/workspace/workspace-terminal-theme";
import { Button } from "@/components/ui/button";
import { publishTerminalSelectionInsert } from "@/features/chat/components/composer/terminal-selection-to-composer";
import { terminalClient } from "@/platform/terminal-client";
import "@xterm/xterm/css/xterm.css";

interface WorkspaceTerminalInstance {
  animationFrame: number;
  controller: TerminalSessionController;
  dataDisposable: { dispose: () => void };
  resizeObserver: ResizeObserver;
  selectionDisposable: { dispose: () => void };
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
  const { t } = useTranslation();
  const instanceRef = useRef<WorkspaceTerminalInstance | null>(null);
  const [selection, setSelection] = useState("");
  const focusOnMountRef = useRef(focusOnMount);
  focusOnMountRef.current = focusOnMount;
  const setContainer = useCallback(
    (container: HTMLDivElement | null) => {
      disposeWorkspaceTerminalInstance(instanceRef.current);
      instanceRef.current = null;

      if (!container) {
        setSelection("");
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
        setSelection(terminal.getSelection());
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
        selectionDisposable,
        terminal,
        themeObserver,
      };
    },
    [root, sessionId],
  );

  const addSelectionToChat = useCallback(() => {
    if (selection.length === 0) return;
    publishTerminalSelectionInsert({ cwd: root, selection });
  }, [root, selection]);

  // The terminal ground is `--card`, not the page, and it runs edge to edge:
  // the padding is inside the scroll surface so nothing frames it.
  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-card">
      <div className="h-full px-2 py-1.5" ref={setContainer} />
      <Button
        className="absolute top-2 right-3 z-10 shadow-sm"
        disabled={selection.length === 0}
        onClick={addSelectionToChat}
        onMouseDown={(event) => event.preventDefault()}
        size="xs"
        type="button"
        variant="secondary"
      >
        {t("workspace.tools.addToChat")}
      </Button>
    </div>
  );
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
