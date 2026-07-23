import type {
  ChatAvailableCommand,
  ChatAvailableSkill,
} from "@angel-engine/daemon-api/chat";
import type { Editor, Extensions } from "@tiptap/core";
import type { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import type {
  ComposerSuggestionItem,
  ComposerSuggestionListHandle,
} from "@/features/chat/components/composer/composer-suggestion-list";
import type { ApiClient } from "@/platform/api-client";
import { Extension } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer as TiptapReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { basename } from "pathe";
import { workspaceFileIconResolver } from "@/app/workspace/workspace-file-tree";
import {
  filterSkills,
  filterSlashCommands,
} from "@/features/chat/components/composer/composer-helpers";
import { ComposerSuggestionList } from "@/features/chat/components/composer/composer-suggestion-list";

export interface ComposerCatalog {
  api: ApiClient;
  commands: ChatAvailableCommand[];
  projectPath: string | undefined;
  projectToolsEnabled: boolean;
  skills: ChatAvailableSkill[];
}

export interface ComposerInteractionRefs {
  blockSubmit: { current: boolean };
  catalog: { current: ComposerCatalog };
  handlePaste: { current: (event: ClipboardEvent) => boolean };
  onCancel: { current: (() => void) | undefined };
  removeLastAttachment: { current: () => boolean };
  sendWithModEnter: { current: boolean };
}

const FILE_MENTION_PLUGIN_KEY = new PluginKey("composerFileMention");
const SKILL_MENTION_PLUGIN_KEY = new PluginKey("composerSkillMention");
const SLASH_COMMAND_PLUGIN_KEY = new PluginKey("composerSlashCommand");

export type ComposerEnterAction = "allow-ime" | "block" | "submit";
export type ComposerEnterIntent = "newline" | "submit";

export function composerEnterIntent({
  modKey,
  sendWithModEnter,
}: {
  modKey: boolean;
  sendWithModEnter: boolean;
}): ComposerEnterIntent {
  return modKey === sendWithModEnter ? "submit" : "newline";
}

export function composerEnterAction({
  blockSubmit,
  composing,
  submitDisabled,
}: {
  blockSubmit: boolean;
  composing: boolean;
  submitDisabled: boolean;
}): ComposerEnterAction {
  if (composing) return "allow-ime";
  return blockSubmit || submitDisabled ? "block" : "submit";
}

export function createComposerExtensions({
  interactions,
  placeholder,
}: {
  interactions: ComposerInteractionRefs;
  placeholder: string;
}): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      horizontalRule: false,
    }),
    Markdown,
    createComposerKeymap(interactions),
    createComposerMentionExtension(interactions),
    Placeholder.configure({ placeholder }),
  ];
}

export function createComposerDisplayExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      horizontalRule: false,
    }),
    Markdown,
    ComposerDisplayMention,
  ];
}

export const ComposerMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      kind: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-kind"),
        renderHTML: (attributes) => dataAttribute("data-kind", attributes.kind),
      },
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-name"),
        renderHTML: (attributes) => dataAttribute("data-name", attributes.name),
      },
      path: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-path"),
        renderHTML: (attributes) => dataAttribute("data-path", attributes.path),
      },
      relativePath: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-relative-path"),
        renderHTML: (attributes) =>
          dataAttribute("data-relative-path", attributes.relativePath),
      },
      mimeType: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-mime-type"),
        renderHTML: (attributes) =>
          dataAttribute("data-mime-type", attributes.mimeType),
      },
      scope: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-scope"),
        renderHTML: (attributes) =>
          dataAttribute("data-scope", attributes.scope),
      },
      description: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-description"),
        renderHTML: (attributes) =>
          dataAttribute("data-description", attributes.description),
      },
      enabled: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-enabled") === "true",
        renderHTML: (attributes) =>
          dataAttribute("data-enabled", attributes.enabled),
      },
      fileType: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-file-type"),
        renderHTML: (attributes) =>
          dataAttribute("data-file-type", attributes.fileType),
      },
    };
  },
  renderMarkdown(node) {
    return `${mentionPrefix(node.attrs?.kind)}${String(node.attrs?.label ?? node.attrs?.id ?? "")}`;
  },
});

export const ComposerDisplayMention = ComposerMention.extend({
  markdownTokenizer: {
    level: "inline",
    name: "mention",
    start: displayMentionStart,
    tokenize: displayMentionToken,
  },
  parseMarkdown: (token) => {
    const value = token as {
      kind: "command" | "file" | "skill";
      label: string;
    };
    return {
      attrs: {
        id: value.label,
        kind: value.kind,
        label: value.label,
        name: value.label,
        path: value.kind === "file" ? value.label : null,
      },
      type: "mention",
    };
  },
}).configure({
  renderHTML: renderComposerMentionHtml,
  renderText: renderComposerMentionText,
});

function dataAttribute(name: string, value: unknown): Record<string, string> {
  if (typeof value === "string" || typeof value === "boolean") {
    return { [name]: String(value) };
  }
  return {};
}

function createComposerMentionExtension(interactions: ComposerInteractionRefs) {
  return ComposerMention.configure({
    renderHTML: renderComposerMentionHtml,
    renderText: renderComposerMentionText,
    suggestions: [
      fileSuggestion(interactions),
      skillSuggestion(interactions),
      commandSuggestion(interactions),
    ] as never,
  });
}

function renderComposerMentionHtml({
  node,
}: Parameters<
  NonNullable<typeof ComposerMention.options.renderHTML>
>[0]): DOMOutputSpec {
  return [
    "span",
    {
      class: mentionClass(node.attrs.kind),
      "data-mention-kind": String(node.attrs.kind),
      "data-type": "mention",
      ...mentionTooltip(node.attrs.kind, node.attrs.description),
    },
    ...(node.attrs.kind === "file"
      ? fileMentionContent(String(node.attrs.path))
      : [`${mentionPrefix(node.attrs.kind)}${node.attrs.label}`]),
  ] as DOMOutputSpec;
}

function renderComposerMentionText({
  node,
}: Parameters<NonNullable<typeof ComposerMention.options.renderText>>[0]) {
  return `${mentionPrefix(node.attrs.kind)}${node.attrs.label}`;
}

function displayMentionStart(source: string) {
  const inline = /(^|\s)(?=\$[A-Za-z]|@[A-Za-z0-9._~/-])/.exec(source);
  const command = /(^|\n)(?=\/[A-Za-z])/.exec(source);
  const inlineIndex = inline === null ? -1 : inline.index + inline[1].length;
  const commandIndex =
    command === null ? -1 : command.index + command[1].length;
  if (inlineIndex === -1) return commandIndex;
  if (commandIndex === -1) return inlineIndex;
  return Math.min(inlineIndex, commandIndex);
}

function displayMentionToken(source: string) {
  const named = /^([$/])([A-Za-z][\w:.-]*)/.exec(source);
  if (named !== null) {
    return {
      kind: named[1] === "$" ? ("skill" as const) : ("command" as const),
      label: named[2],
      raw: named[0],
      type: "mention",
    };
  }
  const file = /^@([^\s]+)/.exec(source);
  if (file === null) return undefined;
  return {
    kind: "file" as const,
    label: file[1],
    raw: file[0],
    type: "mention",
  };
}

function fileSuggestion(
  interactions: ComposerInteractionRefs,
): Omit<
  SuggestionOptions<ComposerSuggestionItem, ComposerSuggestionItem>,
  "editor"
> {
  return {
    char: "@",
    command: ({ editor, props, range }) => {
      if (props.kind !== "file") return;
      const { file } = props;
      insertMention(editor, range, {
        id: file.path,
        fileType: file.type,
        kind: "file",
        label: file.relativePath,
        mimeType: file.mimeType,
        name: file.name,
        path: file.path,
        relativePath: file.relativePath,
      });
    },
    debounce: 120,
    items: async ({ query, signal }) => {
      const catalog = interactions.catalog.current;
      if (
        !catalog.projectToolsEnabled ||
        catalog.projectPath === undefined ||
        query.length === 0
      ) {
        return [];
      }
      const files = await catalog.api.projects.searchFiles({
        limit: 12,
        query,
        root: catalog.projectPath,
      });
      if (signal.aborted) return [];
      return files.map((file) => ({ file, kind: "file" as const }));
    },
    pluginKey: FILE_MENTION_PLUGIN_KEY,
    render: renderComposerSuggestion,
  };
}

function skillSuggestion(
  interactions: ComposerInteractionRefs,
): Omit<
  SuggestionOptions<ComposerSuggestionItem, ComposerSuggestionItem>,
  "editor"
> {
  return {
    char: "$",
    command: ({ editor, props, range }) => {
      if (props.kind !== "skill") return;
      const { skill } = props;
      insertMention(editor, range, {
        description: skill.description,
        enabled: skill.enabled,
        id: skill.path,
        kind: "skill",
        label: skill.name,
        name: skill.name,
        path: skill.path,
        scope: skill.scope,
      });
    },
    items: ({ query }) =>
      filterSkills(interactions.catalog.current.skills, query).map((skill) => ({
        kind: "skill" as const,
        skill,
      })),
    pluginKey: SKILL_MENTION_PLUGIN_KEY,
    render: renderComposerSuggestion,
  };
}

function commandSuggestion(
  interactions: ComposerInteractionRefs,
): Omit<
  SuggestionOptions<ComposerSuggestionItem, ComposerSuggestionItem>,
  "editor"
> {
  return {
    char: "/",
    command: ({ editor, props, range }) => {
      if (props.kind !== "command") return;
      insertMention(editor, range, {
        id: props.command.name,
        kind: "command",
        label: props.command.name,
        name: props.command.name,
      });
    },
    items: ({ query }) =>
      filterSlashCommands(interactions.catalog.current.commands, query).map(
        (command) => ({ command, kind: "command" as const }),
      ),
    pluginKey: SLASH_COMMAND_PLUGIN_KEY,
    render: renderComposerSuggestion,
    startOfLine: true,
  };
}

function insertMention(
  editor: Editor,
  range: { from: number; to: number },
  attrs: Record<string, boolean | string | null>,
) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { attrs, type: "mention" },
      { text: " ", type: "text" },
    ])
    .run();
}

function mentionPrefix(kind: unknown) {
  if (kind === "skill") return "$";
  if (kind === "command") return "/";
  return "@";
}

function mentionClass(kind: unknown) {
  if (kind === "file") {
    return "inline-flex items-center gap-1 font-mono text-primary decoration-clone";
  }
  if (kind === "command") {
    return "font-mono text-primary decoration-clone";
  }
  return "rounded-sm bg-primary/10 px-1 py-0.5 text-primary decoration-clone";
}

function mentionTooltip(kind: unknown, description: unknown) {
  if (kind !== "skill" || typeof description !== "string") return {};
  const title = description.trim();
  return title.length === 0 ? {} : { title };
}

function fileMentionContent(path: string): DOMOutputSpec[] {
  const icon = workspaceFileIconResolver.resolveIcon(
    "file-tree-icon-file",
    path,
  );
  const name = icon.name.replace(/^#/, "");
  const token = icon.token ?? "default";
  const width = icon.width ?? 16;
  const height = icon.height ?? 16;

  return [
    [
      "http://www.w3.org/2000/svg svg",
      {
        "aria-hidden": "true",
        class: "size-3.5 shrink-0",
        "data-icon-name": icon.remappedFrom ?? icon.name,
        "data-icon-token": token,
        fill: "currentColor",
        height: String(height),
        viewBox: icon.viewBox ?? `0 0 ${width} ${height}`,
        width: String(width),
      },
      ["http://www.w3.org/2000/svg use", { href: `#${name}` }],
    ],
    basename(path),
  ] as DOMOutputSpec[];
}

function renderComposerSuggestion() {
  let component:
    | ReactRenderer<
        ComposerSuggestionListHandle,
        SuggestionProps<ComposerSuggestionItem, ComposerSuggestionItem>
      >
    | undefined;
  let unmount: (() => void) | undefined;

  return {
    onExit: () => {
      unmount?.();
      component?.destroy();
    },
    onKeyDown: ({ event }: { event: KeyboardEvent }) =>
      component?.ref?.onKeyDown(event) ?? false,
    onStart: (
      props: SuggestionProps<ComposerSuggestionItem, ComposerSuggestionItem>,
    ) => {
      component = new TiptapReactRenderer(ComposerSuggestionList, {
        editor: props.editor,
        props,
      });
      unmount = props.mount(component.element);
    },
    onUpdate: (
      props: SuggestionProps<ComposerSuggestionItem, ComposerSuggestionItem>,
    ) => component?.updateProps(props),
  };
}

export function createComposerKeymap(
  interactions: Pick<
    ComposerInteractionRefs,
    "blockSubmit" | "onCancel" | "removeLastAttachment" | "sendWithModEnter"
  >,
) {
  const handleSubmit = (editor: Editor) => {
    const form = editor.view.dom.closest("form");
    const submitButton = form?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    const action = composerEnterAction({
      blockSubmit: interactions.blockSubmit.current,
      composing: editor.view.composing,
      submitDisabled: submitButton?.disabled ?? false,
    });
    if (action === "allow-ime") return false;
    if (action === "block") return true;
    form?.requestSubmit();
    return true;
  };

  return Extension.create({
    addKeyboardShortcuts() {
      return {
        Backspace: () =>
          this.editor.isEmpty && interactions.removeLastAttachment.current(),
        Enter: () =>
          composerEnterIntent({
            modKey: false,
            sendWithModEnter: interactions.sendWithModEnter.current,
          }) === "submit"
            ? handleSubmit(this.editor)
            : false,
        Escape: () => {
          const onCancel = interactions.onCancel.current;
          if (onCancel === undefined) return false;
          onCancel();
          return true;
        },
        "Mod-Enter": () =>
          composerEnterIntent({
            modKey: true,
            sendWithModEnter: interactions.sendWithModEnter.current,
          }) === "submit"
            ? handleSubmit(this.editor)
            : this.editor.commands.enter(),
        "Shift-Enter": () => this.editor.commands.setHardBreak(),
      };
    },
    name: "composerKeymap",
    priority: 100,
  });
}
