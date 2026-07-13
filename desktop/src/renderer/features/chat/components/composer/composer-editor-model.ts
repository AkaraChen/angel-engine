import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type {
  ComposerMentionedFile,
  ComposerMentionedSkill,
} from "@/features/chat/components/composer/composer-attachments";

interface ComposerMentionAttributes {
  description: string | null;
  enabled: boolean | null;
  fileType: "directory" | "file" | null;
  id: string;
  kind: "command" | "file" | "skill";
  label: string;
  mimeType: string | null;
  name: string;
  path: string;
  relativePath: string | null;
  scope: "admin" | "repo" | "system" | "user" | null;
}

export interface ComposerDocumentMentions {
  files: ComposerMentionedFile[];
  skills: ComposerMentionedSkill[];
}

export function composerMentionsFromDocument(
  document: ProseMirrorNode,
): ComposerDocumentMentions {
  const files: ComposerMentionedFile[] = [];
  const skills: ComposerMentionedSkill[] = [];

  document.descendants((node) => {
    if (node.type.name !== "mention") return;
    const attributes = node.attrs as ComposerMentionAttributes;
    if (attributes.kind === "file") {
      files.push({
        id: attributes.id,
        mimeType: attributes.mimeType,
        name: attributes.name,
        path: attributes.path,
        relativePath: attributes.relativePath ?? attributes.label,
        type: attributes.fileType ?? "file",
      });
    } else if (attributes.kind === "skill" && attributes.scope !== null) {
      skills.push({
        description: attributes.description ?? "",
        enabled: attributes.enabled ?? true,
        id: attributes.id,
        name: attributes.name,
        path: attributes.path,
        scope: attributes.scope,
      });
    }
  });

  return { files, skills };
}
