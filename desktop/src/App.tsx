import {
  Bot,
  Folder,
  MessageSquare,
  MessageSquarePlus,
  Search,
  Settings,
  Workflow,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

const primaryItems = [
  { label: 'New chat', icon: MessageSquarePlus },
  { label: 'Search', icon: Search },
  { label: 'Automation', icon: Workflow },
];
const projectItems = ['Project Alpha', 'Project Beta', 'Project Gamma'];
const nestedItems = ['Recent thread', 'Build notes', 'Release checklist'];

export function App() {
  return (
    <SidebarProvider>
      <Sidebar variant="inset" className="border-r">
        <SidebarHeader className="px-2 py-3">
          <SidebarMenu>
            {primaryItems.map(({ label, icon: Icon }) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton>
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <Folder />
                    <span>Active Project</span>
                  </SidebarMenuButton>
                  <div className="ml-6 mt-1 grid gap-1 border-l pl-3">
                    {nestedItems.map((item) => (
                      <SidebarMenuButton key={item} size="sm">
                        <span className="truncate">{item}</span>
                      </SidebarMenuButton>
                    ))}
                  </div>
                </SidebarMenuItem>

                {projectItems.map((item) => (
                  <SidebarMenuItem key={item}>
                    <SidebarMenuButton>
                      <Folder />
                      <span>{item}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Chats</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <MessageSquare />
                    <span className="truncate">Standalone thread</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-sm font-medium">
              <Bot className="size-4 shrink-0" />
              <span className="truncate">Thread layout</span>
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Sidebar inset content
            </p>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          <section className="flex-1 p-4">
            <div className="h-full rounded-md border bg-background" />
          </section>

          <footer className="border-t p-4">
            <div className="flex gap-2">
              <div className="min-h-10 flex-1 rounded-md border bg-background" />
              <Button>Send</Button>
            </div>
          </footer>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
