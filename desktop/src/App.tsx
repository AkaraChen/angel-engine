import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  GitBranch,
  Plus,
  RefreshCw,
  Terminal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const runtimeItems = [
  { label: 'Electron', value: '41.5.0', icon: Cpu },
  { label: 'React', value: '19.2.5', icon: Activity },
  { label: 'Tailwind', value: '4.2.4', icon: Terminal },
];

const pipelineItems = [
  {
    title: 'Native client bridge',
    description: 'N-API package ready for desktop integration.',
    status: 'Ready',
  },
  {
    title: 'Renderer shell',
    description: 'React, Tailwind, and shadcn components are wired.',
    status: 'Ready',
  },
  {
    title: 'Packaging',
    description: 'Electron Forge makers are configured for release builds.',
    status: 'Configured',
  },
];

const activityItems = [
  'Created Vite-powered Electron renderer',
  'Installed React 19 runtime dependencies',
  'Generated shadcn/ui button, card, and badge components',
];

export function App() {
  return (
    <main className="min-h-screen bg-background">
      <div className="flex min-h-screen flex-col">
        <header className="border-b bg-card">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GitBranch className="size-4" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-base font-semibold">Angel Engine Desktop</h1>
                <p className="text-sm text-muted-foreground">
                  Local runtime workspace
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">React 19</Badge>
              <Badge variant="outline">shadcn/ui</Badge>
              <Button variant="outline" size="sm">
                <RefreshCw data-icon="inline-start" className="size-3.5" />
                Sync
              </Button>
              <Button size="sm">
                <Plus data-icon="inline-start" className="size-3.5" />
                New run
              </Button>
            </div>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-b bg-muted/30 p-4 lg:border-r lg:border-b-0">
            <nav className="grid gap-1">
              {['Overview', 'Pipelines', 'Artifacts', 'Settings'].map((item) => (
                <Button
                  key={item}
                  variant={item === 'Overview' ? 'secondary' : 'ghost'}
                  className="justify-start"
                >
                  {item}
                </Button>
              ))}
            </nav>
          </aside>

          <section className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {runtimeItems.map(({ label, value, icon: Icon }) => (
                <Card key={label} size="sm">
                  <CardHeader>
                    <CardTitle>{label}</CardTitle>
                    <CardAction>
                      <Icon className="size-4 text-muted-foreground" />
                    </CardAction>
                    <CardDescription>Runtime dependency</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <Card>
                <CardHeader>
                  <CardTitle>Desktop setup</CardTitle>
                  <CardDescription>
                    Core pieces are installed and ready for application code.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {pipelineItems.map((item) => (
                    <div
                      key={item.title}
                      className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{item.title}</div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                      <Badge variant="outline" className="self-start">
                        <CheckCircle2
                          data-icon="inline-start"
                          className="size-3"
                        />
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent activity</CardTitle>
                  <CardDescription>Scaffold actions completed.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3">
                    {activityItems.map((item) => (
                      <li key={item} className="flex gap-3 text-sm">
                        <span className="mt-1 size-2 rounded-full bg-primary" />
                        <span className="min-w-0 text-muted-foreground">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <Button variant="outline" className="mt-5 w-full">
                    Open workspace
                    <ArrowRight
                      data-icon="inline-end"
                      className="size-3.5"
                    />
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Integration target</CardTitle>
                <CardDescription>
                  Use the renderer as the control surface for local engine work.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {[
                  ['Client API', 'Connect renderer actions to the N-API bridge.'],
                  ['State', 'Promote runtime data into a shared store.'],
                  ['Release', 'Package signed builds through Forge makers.'],
                ].map(([title, description]) => (
                  <div key={title} className="rounded-lg border bg-background p-3">
                    <div className="flex items-center gap-2 font-medium">
                      <Database className="size-4 text-muted-foreground" />
                      {title}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {description}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
