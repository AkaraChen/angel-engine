function isUserBubblePart(part: {
  status?: { type: string };
  text?: string;
  type: string;
}) {
  switch (part.type) {
    case "file":
    case "image":
    case "source":
      return false;
    case "text":
      return part.status?.type === "running" || Boolean(part.text);
    default:
      return true;
  }
}

export { isUserBubblePart };
