import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SettingsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-4 pt-3 pb-2">
        <h1 className="font-heading text-xl font-semibold">Settings</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Angel Engine mobile shell. Settings arrive in a later sub-issue.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
