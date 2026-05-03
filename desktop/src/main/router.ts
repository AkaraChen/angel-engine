import { BrowserWindow, dialog, Menu, shell } from 'electron';
import { tipc } from '@egoist/tipc/main';

import type { ChatSendInput } from '../shared/chat';
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from '../shared/projects';
import { sendChat } from './chat/angel-client';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from './projects/repository';

const t = tipc.create();

export const appRouter = {
  chatSend: t.procedure
    .input<ChatSendInput>()
    .action(async ({ input }) => sendChat(assertChatSendInput(input))),

  projectsChooseDirectory: t.procedure.action(async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Choose project folder',
    });

    return result.canceled ? null : result.filePaths[0];
  }),

  projectsCreate: t.procedure
    .input<CreateProjectInput>()
    .action(async ({ input }) => createProject(assertCreateInput(input))),

  projectsDelete: t.procedure
    .input<string>()
    .action(async ({ input }) =>
      deleteProject(assertString(input, 'Project id is required.'))
    ),

  projectsGet: t.procedure
    .input<string>()
    .action(async ({ input }) =>
      getProject(assertString(input, 'Project id is required.'))
    ),

  projectsList: t.procedure.action(async () => listProjects()),

  projectsShowContextMenu: t.procedure
    .input<string>()
    .action(async ({ context, input }) => {
      const project = getProject(assertString(input, 'Project id is required.'));
      if (!project) {
        throw new Error('Project not found.');
      }

      return new Promise<'cancelled' | 'deleted' | 'opened'>((resolve) => {
        const menu = Menu.buildFromTemplate([
          {
            click: async () => {
              await shell.openPath(project.path);
              resolve('opened');
            },
            label: 'Open in Finder',
          },
          { type: 'separator' },
          {
            click: () => {
              deleteProject(project.id);
              resolve('deleted');
            },
            label: 'Delete',
          },
        ]);

        menu.popup({
          callback: () => resolve('cancelled'),
          window: BrowserWindow.fromWebContents(context.sender) ?? undefined,
        });
      });
    }),

  projectsUpdate: t.procedure
    .input<UpdateProjectInput>()
    .action(async ({ input }) => updateProject(assertUpdateInput(input))),
};

export type AppRouter = typeof appRouter;

function assertChatSendInput(input: ChatSendInput): ChatSendInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Chat input is required.');
  }

  return {
    cwd: typeof input.cwd === 'string' && input.cwd.trim() ? input.cwd : undefined,
    text: assertString(input.text, 'Chat text is required.'),
  };
}

function assertCreateInput(input: CreateProjectInput): CreateProjectInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Project input is required.');
  }

  return {
    id: typeof input.id === 'string' ? input.id : undefined,
    path: assertString(input.path, 'Project path is required.'),
  };
}

function assertUpdateInput(input: UpdateProjectInput): UpdateProjectInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Project input is required.');
  }

  return {
    id: assertString(input.id, 'Project id is required.'),
    path: assertString(input.path, 'Project path is required.'),
  };
}

function assertString(value: unknown, message: string) {
  if (typeof value !== 'string') {
    throw new Error(message);
  }
  return value;
}
