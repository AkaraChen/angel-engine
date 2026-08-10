import type { GitHubResolvedItem } from "@angel-engine/daemon-api/github";

export type ComposerGitHubAttachment = GitHubResolvedItem & {
  id: string;
  /** Discriminator for multi-provider attachment drafts in the composer. */
  provider: "github";
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
  return `#${item.number} · ${item.title}`;
}
