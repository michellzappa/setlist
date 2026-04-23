"use client";

import { useAppConfig } from "@/lib/app-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeptenaMark } from "@/components/septena-mark";
import { mutate } from "swr";

/** Intercepts all rendering when the data directory is missing or
 *  empty. Shows a setup checklist with the two main bootstrap paths:
 *  copy the example skeleton, or seed demo data. User clicks "Check
 *  again" after they've run the commands — we re-fetch /api/config. */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const config = useAppConfig();

  if (config.vault_exists && config.vault_has_sections) {
    return <>{children}</>;
  }

  return <OnboardingScreen vaultPath={config.paths.vault} exists={config.vault_exists} />;
}

function OnboardingScreen({ vaultPath, exists }: { vaultPath: string; exists: boolean }) {
  const recheck = () => mutate("app-config");

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <section className="mb-8 rounded-[2rem] border border-brand-accent-soft bg-linear-to-br from-brand-accent-soft via-background to-background p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] border border-brand-accent-soft bg-background/90 shadow-sm">
            <SeptenaMark className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome to Septena</h1>
            <p className="mt-2 text-muted-foreground">
              {exists
                ? "Your data folder exists but has no section folders yet. Pick one of the two paths below to get started."
                : "We couldn't find your data folder. Pick one of the two paths below to get started."}
            </p>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              The Septena mark keeps its fixed seven-color palette. Once your data folder is in place,
              each section inside the app gets its own configurable accent for charts, buttons,
              and navigation.
            </p>
          </div>
        </div>
      </section>

      <Card className="mb-4 border-brand-accent-soft">
        <CardHeader>
          <CardTitle className="text-brand-accent">Current data folder</CardTitle>
          <CardDescription>
            Set by <code>SEPTENA_DATA_DIR</code>, or defaults to{" "}
            <code>~/Documents/septena-data</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block rounded bg-muted px-3 py-2 text-sm">{vaultPath}</code>
        </CardContent>
      </Card>

      <Card className="mb-4 border-brand-accent-soft">
        <CardHeader>
          <CardTitle>Option A — Copy the example skeleton</CardTitle>
          <CardDescription>Empty sections, ready for your real logs.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">{`cp -R examples/vault/Bases/* "${vaultPath}/"`}</pre>
          <p className="mt-3 text-sm text-muted-foreground">
            Creates the core three sections — <strong>Training</strong>, <strong>Nutrition</strong>, <strong>Habits</strong> — plus Settings, inside your data folder. Want more?
            Drop extras from <code>examples/vault/optional/</code> (Supplements, Chores,
            Caffeine, Cannabis) into the same place. Each folder that exists becomes a tab.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6 border-brand-accent-soft">
        <CardHeader>
          <CardTitle>Option B — Try it with demo data</CardTitle>
          <CardDescription>30 days of fake meals, sessions, habits, and supplements. Disposable.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">{`npm run seed-demo
# then restart the backend with:
SEPTENA_DATA_DIR=/tmp/septena-demo-vault \\
  SEPTENA_INTEGRATIONS_DIR=/tmp/none \\
  uvicorn main:app --port 4445 --reload`}</pre>
          <p className="mt-3 text-sm text-muted-foreground">
            Everything under <code>/tmp/septena-demo-vault</code> — delete the folder when you are done.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={recheck}
          className="border-brand-accent bg-brand-accent text-white hover:bg-brand-accent-strong"
        >
          Check again
        </Button>
        <a
          href="https://github.com/septena/septena#quickstart"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-brand-accent hover:underline"
        >
          Full quickstart in the README →
        </a>
      </div>
    </main>
  );
}
