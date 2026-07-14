import type { WorkspaceWindowFileState } from "@/app/workspace/workspace-tool-store";

import { X as Close } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { basename } from "pathe";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { formatUnsupportedFileReason } from "@/app/workspace/workspace-file-display";
import {
  workspaceFileIconResolver,
  WorkspaceFileTreeFileIcon,
  workspaceFileTreeIconColorStyle,
  WorkspaceFileTreeIconSprite,
} from "@/app/workspace/workspace-file-tree";
import {
  defineWorkspaceMonacoThemes,
  workspaceMonacoThemeDark,
  workspaceMonacoThemeLight,
} from "@/app/workspace/workspace-monaco-theme";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import { isWorkspaceWindowFileStateDirty } from "@/app/workspace/workspace-tool-store";
import { useWorkspaceToolTabKeyboard } from "@/app/workspace/workspace-tool-tab-model";
import { cn } from "@/platform/utils";

const loadWorkspaceMonacoModule = async () => import("monaco-editor");

const WorkspaceMonacoEditor = lazy(async () => {
  const [editorModule, monacoModule] = await Promise.all([
    import("@monaco-editor/react"),
    loadWorkspaceMonacoModule(),
  ]);
  editorModule.loader.config({ monaco: monacoModule });
  disableWorkspaceMonacoTypeScriptServices(monacoModule);
  defineWorkspaceMonacoThemes(monacoModule);

  return { default: editorModule.default };
});

const workspaceMonacoDisplayEditorOptions = {
  "semanticHighlighting.enabled": false,
  acceptSuggestionOnEnter: "off",
  automaticLayout: true,
  codeLens: false,
  colorDecorators: false,
  contextmenu: false,
  folding: false,
  fontSize: 12,
  hover: { enabled: false },
  links: false,
  minimap: { enabled: false },
  parameterHints: { enabled: false },
  quickSuggestions: false,
  renderValidationDecorations: "off",
  scrollBeyondLastLine: false,
  selectionHighlight: false,
  suggestOnTriggerCharacters: false,
  tabCompletion: "off",
  wordBasedSuggestions: "off",
} as const;

const workspaceMonacoLanguageByFileTreeToken: Partial<Record<string, string>> =
  {
    astro: "html",
    babel: "javascript",
    bash: "shell",
    c: "c",
    cpp: "cpp",
    css: "css",
    database: "sql",
    docker: "dockerfile",
    go: "go",
    graphql: "graphql",
    html: "html",
    javascript: "javascript",
    json: "json",
    markdown: "markdown",
    npm: "json",
    python: "python",
    react: "typescript",
    ruby: "ruby",
    rust: "rust",
    sass: "scss",
    svg: "xml",
    swift: "swift",
    typescript: "typescript",
    vue: "html",
    yml: "yaml",
  };

export function WorkspaceWindowFileEditor({
  activePath,
  fileStates,
  openFilePaths,
  onClose,
  onContentChange,
  onSelect,
}: {
  activePath: string | null;
  fileStates: Record<string, WorkspaceWindowFileState>;
  openFilePaths: string[];
  onClose: (path: string) => void;
  onContentChange: (content: string) => void;
  onSelect: (path: string) => void;
}) {
  const [editorTheme, setEditorTheme] = useState(getWorkspaceMonacoTheme);
  useEffect(() => {
    const updateTheme = () => {
      setEditorTheme(getWorkspaceMonacoTheme());
    };
    const themeObserver = new MutationObserver(updateTheme);

    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    return () => {
      themeObserver.disconnect();
    };
  }, []);

  if (openFilePaths.length === 0 || !is.nonEmptyString(activePath)) {
    return <WorkspaceToolEmpty title="Select a file" />;
  }

  const activeState = fileStates[activePath] ?? { status: "loading" };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <WorkspaceWindowFileTabBar
        activePath={activePath}
        fileStates={fileStates}
        openFilePaths={openFilePaths}
        onClose={onClose}
        onSelect={onSelect}
      />
      {activeState.status === "loading" ? (
        <div className="min-h-0 flex-1 bg-background" />
      ) : activeState.status === "error" ? (
        <WorkspaceToolEmpty
          detail={activeState.message}
          title="File unavailable"
        />
      ) : activeState.status === "unsupported" ? (
        <WorkspaceToolEmpty
          detail={formatUnsupportedFileReason(activeState.result)}
          title={activeState.result.path}
        />
      ) : (
        <Suspense fallback={<div className="min-h-0 flex-1 bg-background" />}>
          <WorkspaceMonacoEditor
            className="min-h-0 flex-1"
            defaultLanguage={getWorkspaceMonacoLanguageFromFileTree(activePath)}
            path={activePath}
            theme={editorTheme}
            value={activeState.draftContent}
            options={workspaceMonacoDisplayEditorOptions}
            onChange={(value) => onContentChange(value ?? "")}
          />
        </Suspense>
      )}
    </div>
  );
}

function WorkspaceWindowFileTabBar({
  activePath,
  fileStates,
  openFilePaths,
  onClose,
  onSelect,
}: {
  activePath: string;
  fileStates: Record<string, WorkspaceWindowFileState>;
  openFilePaths: string[];
  onClose: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const tabs = useMemo(
    () => openFilePaths.map((path) => ({ id: path })),
    [openFilePaths],
  );
  const closeTab = useCallback(
    (tab: { id: string }) => {
      onClose(tab.id);
    },
    [onClose],
  );
  const { handleTabKeyDown, setTabButtonRef, tabButtonsRef } =
    useWorkspaceToolTabKeyboard({
      onCloseTab: closeTab,
      onSelectTab: onSelect,
      orientation: "horizontal",
      tabs,
    });
  useEffect(() => {
    tabButtonsRef.current
      .get(activePath)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePath, tabButtonsRef]);

  return (
    <div
      className="
        flex h-9 shrink-0 items-stretch border-b border-border-subtle
        bg-surface-1 text-xs
      "
      style={workspaceFileTreeIconColorStyle}
    >
      <WorkspaceFileTreeIconSprite />
      <div
        aria-label="Open files"
        className="
          flex min-w-0 flex-1 overflow-x-auto
          [&::-webkit-scrollbar]:hidden
        "
        role="tablist"
      >
        {openFilePaths.map((path) => {
          const active = path === activePath;
          const dirty = isWorkspaceWindowFileStateDirty(fileStates[path]);
          const fileName = basename(path);

          return (
            <div
              className={cn(
                `
                  group/tab flex h-9 max-w-80 min-w-32 items-center gap-2
                  border-r border-border-subtle px-3 text-muted-foreground
                `,
                active
                  ? "bg-background text-foreground"
                  : `
                    hover:bg-overlay-hover hover:text-foreground
                    active:bg-overlay-active
                  `,
              )}
              key={path}
              role="presentation"
              title={path}
            >
              <button
                aria-selected={active}
                className="
                  flex h-full min-w-0 flex-1 items-center gap-2 text-left
                  outline-none
                  focus-visible:ring-2 focus-visible:ring-ring/50
                  focus-visible:ring-inset
                "
                onAuxClick={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                    onClose(path);
                  }
                }}
                onClick={() => onSelect(path)}
                onKeyDown={(event) => handleTabKeyDown(event, path)}
                ref={(button) => setTabButtonRef(path, button)}
                role="tab"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <WorkspaceFileTreeFileIcon path={path} />
                <span className="min-w-0 truncate">{fileName}</span>
              </button>
              <button
                aria-label={`Close ${fileName}`}
                className="
                  group/close ml-1 flex size-5 shrink-0 items-center
                  justify-center rounded-sm text-muted-foreground outline-none
                  hover:bg-overlay-hover hover:text-foreground
                  focus-visible:ring-2 focus-visible:ring-ring/50
                  focus-visible:ring-inset
                  active:bg-overlay-active
                "
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(path);
                }}
                tabIndex={active ? 0 : -1}
                title={`Close ${fileName}`}
                type="button"
              >
                {dirty ? (
                  <>
                    <span
                      className="
                        size-2 rounded-full bg-foreground
                        group-hover/close:hidden
                      "
                    />
                    <Close
                      className="
                        hidden size-3.5
                        group-hover/close:block
                      "
                    />
                  </>
                ) : (
                  <Close className="size-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getWorkspaceMonacoLanguageFromFileTree(path: string) {
  const token = workspaceFileIconResolver.resolveIcon(
    "file-tree-icon-file",
    path,
  ).token;

  return (
    (is.nonEmptyString(token)
      ? workspaceMonacoLanguageByFileTreeToken[token]
      : undefined) ?? "plaintext"
  );
}

function getWorkspaceMonacoTheme() {
  return document.documentElement.classList.contains("dark")
    ? workspaceMonacoThemeDark
    : workspaceMonacoThemeLight;
}

function disableWorkspaceMonacoTypeScriptServices(
  monacoModule: Awaited<ReturnType<typeof loadWorkspaceMonacoModule>>,
) {
  const modeConfiguration = {
    codeActions: false,
    completionItems: false,
    definitions: false,
    diagnostics: false,
    documentHighlights: false,
    documentRangeFormattingEdits: false,
    documentSymbols: false,
    hovers: false,
    inlayHints: false,
    onTypeFormattingEdits: false,
    references: false,
    rename: false,
    signatureHelp: false,
  };
  const diagnosticsOptions = {
    noSemanticValidation: true,
    noSuggestionDiagnostics: true,
    noSyntaxValidation: true,
  };

  monacoModule.typescript.typescriptDefaults.setDiagnosticsOptions(
    diagnosticsOptions,
  );
  monacoModule.typescript.javascriptDefaults.setDiagnosticsOptions(
    diagnosticsOptions,
  );
  monacoModule.typescript.typescriptDefaults.setModeConfiguration(
    modeConfiguration,
  );
  monacoModule.typescript.javascriptDefaults.setModeConfiguration(
    modeConfiguration,
  );
}
