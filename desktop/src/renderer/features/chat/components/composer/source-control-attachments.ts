import type {
  ChangeRequest,
  WorkItem,
} from "@angel-engine/daemon-api/source-control";

export interface ComposerSourceControlAttachment {
  author: string | null;
  body: string;
  contextText: string;
  draft: boolean;
  id: string;
  itemId: string;
  kind: "changeRequest" | "workItem";
  number: number | null;
  providerId: string;
  repositoryPath: string;
  sourceBranch: string | null;
  state: string;
  targetBranch: string | null;
  title: string;
  url: string;
}

export function workItemAttachment(
  item: WorkItem,
  providerDisplayName: string,
): ComposerSourceControlAttachment {
  return createAttachment({
    author: item.author?.login ?? null,
    body: item.body,
    draft: false,
    itemId: item.id,
    kind: "workItem",
    number: item.number,
    providerDisplayName,
    providerId: item.repository.providerId,
    repositoryPath: item.repository.displayPath,
    sourceBranch: null,
    state: item.state,
    targetBranch: null,
    title: item.title,
    url: item.webUrl,
  });
}

export function changeRequestAttachment(
  item: ChangeRequest,
  providerDisplayName: string,
): ComposerSourceControlAttachment {
  return createAttachment({
    author: item.author?.login ?? null,
    body: item.body,
    draft: item.draft,
    itemId: item.id,
    kind: "changeRequest",
    number: item.number,
    providerDisplayName,
    providerId: item.repository.providerId,
    repositoryPath: item.repository.displayPath,
    sourceBranch: item.source.name,
    state: item.state,
    targetBranch: item.target.name,
    title: item.title,
    url: item.webUrl,
  });
}

export function appendSourceControlContexts(
  text: string,
  attachments: readonly ComposerSourceControlAttachment[],
): string {
  if (attachments.length === 0) return text;
  const block = attachments.map((item) => item.contextText).join("\n\n");
  const trimmed = text.trimEnd();
  if (trimmed.length === 0) return block;
  return `${trimmed}\n\n---\n${block}`;
}

export function sourceControlAttachmentLabel(
  item: ComposerSourceControlAttachment,
): string {
  const identifier = item.number === null ? item.itemId : `#${item.number}`;
  return `${identifier} · ${item.title}`;
}

function createAttachment(
  item: Omit<ComposerSourceControlAttachment, "contextText" | "id"> & {
    providerDisplayName: string;
  },
): ComposerSourceControlAttachment {
  const { providerDisplayName, ...attachment } = item;
  const identifier = item.number === null ? item.itemId : `#${item.number}`;
  const kind = item.kind === "changeRequest" ? "Change request" : "Work item";
  const details = [
    `${providerDisplayName} ${kind} ${identifier} — ${item.title}`,
    "",
    `Repository: ${item.repositoryPath}`,
    `Source: ${item.url}`,
    `State: ${item.state}`,
  ];
  if (item.kind === "changeRequest") {
    details.push(
      `Branches: ${item.targetBranch ?? "?"} ← ${item.sourceBranch ?? "?"}`,
    );
    if (item.draft) details.push("Draft: yes");
  }
  if (item.author !== null) details.push(`Author: @${item.author}`);
  if (item.body.length > 0) details.push("", "Body:", item.body);
  return {
    ...attachment,
    contextText: details.join("\n"),
    id: attachmentId(item.providerId, item.kind),
  };
}

function attachmentId(providerId: string, kind: string) {
  return `source-control-${providerId}-${kind}-${crypto.randomUUID()}`;
}
