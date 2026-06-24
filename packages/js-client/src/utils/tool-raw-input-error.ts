export class ChatToolRawInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatToolRawInputError";
  }
}
