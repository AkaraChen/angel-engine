const composerRichTextClassName = `
  w-full
  [&_.tiptap]:max-h-40
  [&_.tiptap]:min-h-(--workspace-composer-min-height)
  [&_.tiptap]:overflow-y-auto
  [&_.tiptap]:[font-size:var(--workspace-composer-text-size)]
  [&_.tiptap]:leading-(--workspace-composer-line-height)
  [&_.tiptap]:wrap-anywhere [&_.tiptap]:outline-none
  [&_.tiptap_.is-editor-empty:first-child::before]:pointer-events-none
  [&_.tiptap_.is-editor-empty:first-child::before]:float-left
  [&_.tiptap_.is-editor-empty:first-child::before]:h-0
  [&_.tiptap_.is-editor-empty:first-child::before]:text-muted-foreground/62
  [&_.tiptap_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
  [&_.tiptap_blockquote]:border-l-2
  [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:pl-3
  [&_.tiptap_code]:rounded-sm [&_.tiptap_code]:bg-muted
  [&_.tiptap_code]:px-1 [&_.tiptap_code]:py-0.5
  [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5
  [&_.tiptap_p]:my-0
  [&_.tiptap_pre]:overflow-x-auto [&_.tiptap_pre]:rounded-md
  [&_.tiptap_pre]:bg-muted [&_.tiptap_pre]:p-3
  [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5
`;

export { composerRichTextClassName };
