import type { ResolvedTaskLink } from "@angel-engine/daemon-api/links";

export type ComposerGitHubAttachment = ResolvedTaskLink & {
  id: string;
};

export function appendGitHubContexts(
  text: string,
  attachments: readonly ComposerGitHubAttachment[],
): string {
  if (attachments.length === 0) return text;
  const block = attachments.map((item) => item.contextText).join("\n\n");
  const trimmed = text.trimEnd();
  if (trimmed.length === 0) return block;
  return `${trimmed}\n\n---\n${block}`;
}

export function githubAttachmentLabel(item: ComposerGitHubAttachment): string {
  return item.provider === "github"
    ? `#${item.number} · ${item.title}`
    : `${item.identifier} · ${item.title}`;
}
