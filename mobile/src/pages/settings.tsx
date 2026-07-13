import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Angel Engine mobile shell. Settings arrive in a later sub-issue.
        </CardContent>
      </Card>
    </div>
  );
}
