export function handleComposerFilePaste(
  event: ClipboardEvent,
  addFiles: (files: File[]) => void,
): boolean {
  const files = [...(event.clipboardData?.items ?? [])]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  if (files.length === 0) return false;

  event.preventDefault();
  addFiles(files);
  return true;
}
