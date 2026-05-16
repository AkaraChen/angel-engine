import type { Chat, ChatHistoryMessage, Project } from "./types.js";

export interface AngelStore {
  archiveChat: (chatId: string) => Promise<Chat>;
  appendMessage: (
    chatId: string,
    message: ChatHistoryMessage,
  ) => Promise<ChatHistoryMessage>;
  createChat: (chat: Chat) => Promise<Chat>;
  createProject: (project: Project) => Promise<Project>;
  deleteAllChats: () => Promise<void>;
  getChat: (chatId: string) => Promise<Chat | undefined>;
  getMessages: (chatId: string) => Promise<ChatHistoryMessage[]>;
  getProject: (projectId: string) => Promise<Project | undefined>;
  listChats: () => Promise<Chat[]>;
  listProjects: () => Promise<Project[]>;
  replaceMessages: (
    chatId: string,
    messages: ChatHistoryMessage[],
  ) => Promise<void>;
  updateChat: (chat: Chat) => Promise<Chat>;
}

export class InMemoryAngelStore implements AngelStore {
  #chats = new Map<string, Chat>();
  #messages = new Map<string, ChatHistoryMessage[]>();
  #projects = new Map<string, Project>();

  async archiveChat(chatId: string): Promise<Chat> {
    const chat = await this.requireChat(chatId);
    return this.updateChat({ ...chat, archived: true });
  }

  async appendMessage(
    chatId: string,
    message: ChatHistoryMessage,
  ): Promise<ChatHistoryMessage> {
    const messages = this.#messages.get(chatId);
    if (!messages) {
      throw new Error(`Messages for chat "${chatId}" were not initialized.`);
    }
    this.#messages.set(chatId, [...messages, message]);
    return message;
  }

  async createChat(chat: Chat): Promise<Chat> {
    this.#chats.set(chat.id, chat);
    this.#messages.set(chat.id, []);
    return chat;
  }

  async createProject(project: Project): Promise<Project> {
    this.#projects.set(project.id, project);
    return project;
  }

  async deleteAllChats(): Promise<void> {
    this.#chats.clear();
    this.#messages.clear();
  }

  async getChat(chatId: string): Promise<Chat | undefined> {
    return this.#chats.get(chatId);
  }

  async getMessages(chatId: string): Promise<ChatHistoryMessage[]> {
    const messages = this.#messages.get(chatId);
    if (!messages) {
      throw new Error(`Messages for chat "${chatId}" were not initialized.`);
    }
    return [...messages];
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    return this.#projects.get(projectId);
  }

  async listChats(): Promise<Chat[]> {
    return [...this.#chats.values()]
      .filter((chat) => !chat.archived)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listProjects(): Promise<Project[]> {
    return [...this.#projects.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
  }

  async replaceMessages(
    chatId: string,
    messages: ChatHistoryMessage[],
  ): Promise<void> {
    this.#messages.set(chatId, [...messages]);
  }

  async updateChat(chat: Chat): Promise<Chat> {
    this.#chats.set(chat.id, chat);
    return chat;
  }

  private async requireChat(chatId: string): Promise<Chat> {
    const chat = await this.getChat(chatId);
    if (!chat) throw new Error(`Chat "${chatId}" was not found.`);
    return chat;
  }
}
