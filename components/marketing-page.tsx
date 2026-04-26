import Image from "next/image";
import Link from "next/link";
import { SeptenaMark } from "@/components/septena-mark";
import { GitHubStarButton, GITHUB_URL } from "@/components/github-star-button";
import { MARKETING_SECTIONS, type MarketingSection } from "@/lib/marketing-sections";
import { sectionAccentVars } from "@/lib/section-colors";

export function MarketingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:py-16">
      <Nav />
      <Hero />
      <Why />
      <BringYourOwnAgent />
      <Sections />
      <HowDataWorks />
      <Install />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <nav className="mb-12 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <SeptenaMark className="h-7 w-7" />
        <span className="text-lg font-semibold tracking-tight">Septena</span>
      </div>
      <GitHubStarButton />
    </nav>
  );
}

function Hero() {
  return (
    <section className="mb-20 grid gap-6 md:grid-cols-2 md:items-center md:gap-10">
      <div className="max-w-xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-wider text-brand-accent">
          Seven days. One view.
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          A weekly view of everything your body is telling you.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground sm:text-xl">
          Training, nutrition, habits, sleep, vitals. One place, one week at a time. Runs on your
          machine. Writes YAML files your agents can already read.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="inline-flex items-center rounded-full border border-brand-accent bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-accent-strong"
          >
            Try the demo
          </Link>
          <Link
            href="#install"
            className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            Install it yourself
          </Link>
          <Link
            href="#sections"
            className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            See what it tracks
          </Link>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
        <picture>
          <source srcSet="/screenshots/overview-dark.png" media="(prefers-color-scheme: dark)" />
          <Image
            src="/screenshots/overview.png"
            alt="Septena overview — one tile per section showing today's state across training, nutrition, habits, sleep, and more."
            width={1200}
            height={800}
            priority
            className="h-auto w-full"
          />
        </picture>
      </div>
    </section>
  );
}

function Why() {
  return (
    <section className="mb-20 max-w-2xl space-y-4 text-base leading-relaxed sm:text-lg">
      <p>
        I wanted one place for the things I track about myself: workouts, meals, habits, sleep,
        supplements, caffeine, chores. I did not want five apps. I did not want my data sitting
        in anyone else&apos;s database.
      </p>
      <p>
        Septena is that place. Every entry is a YAML file in a folder on my machine. The app
        is a Next.js frontend and a FastAPI backend that read and write those files. That is
        the whole architecture.
      </p>
      <p>
        Most views span seven days. A day is too noisy and a month is too late; a week is where
        sleep, training, food, and habits start to relate to each other. The seven dots in the
        logo, and the name (<em>heptad</em>, seven), just point at that.
      </p>
    </section>
  );
}

function BringYourOwnAgent() {
  return (
    <section className="mb-20 max-w-3xl space-y-5 text-base leading-relaxed sm:text-lg">
      <h2 className="text-2xl font-semibold tracking-tight">Bring your own agent</h2>
      <p>
        Your health data is a folder of YAML files on your machine. Any model can read it.
        Every change is a git commit.
      </p>
      <p>
        Point Claude Code, Cursor, an Obsidian plugin, or a local LLM at{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          ~/Documents/septena-data/
        </code>{" "}
        and ask it whatever you want:
      </p>
      <ul className="ml-6 list-disc space-y-2 text-foreground/90">
        <li>
          <span className="font-medium">Read the data.</span> &quot;Plot my protein intake against
          next-morning HRV for the last 90 days.&quot; The agent reads the YAML. No API, no schema
          docs.
        </li>
        <li>
          <span className="font-medium">Write the data.</span> Paste a cafe receipt or a photo of
          a food label, and have the agent append a clean nutrition entry to the right folder.
        </li>
        <li>
          <span className="font-medium">Explain the data.</span> &quot;Draft a note to my doctor
          summarizing the last three months of sleep, weight, and training volume.&quot;
        </li>
      </ul>
      <p>
        The folder is a git repo, so every agent-written change is a reviewable diff. Every
        section also ships a{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">SKILL.md</code>{" "}
        with the filename pattern, YAML schema, and example entries. Point your agent at the
        skill and it logs correctly the first time.
      </p>
      <p className="text-sm text-muted-foreground">
        Septena does not ship an agent. It stores your data in a shape yours can use.
      </p>
    </section>
  );
}

function Sections() {
  return (
    <section id="sections" className="mb-20 space-y-16">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight">What Septena tracks</h2>
        <p className="mt-2 text-muted-foreground">
          Eleven sections, one folder. Each links to a page with the data shape and a live demo.
        </p>
      </div>
      {MARKETING_SECTIONS.map((s) => (
        <SectionBlockView key={s.slug} section={s} />
      ))}
    </section>
  );
}

function SectionBlockView({ section }: { section: MarketingSection }) {
  // Publish the same --section-accent ramp the dashboard uses, so this block
  // and any descendants can consume `var(--section-accent)` instead of
  // re-implementing color-mix() per call site.
  return (
    <article
      className="relative grid gap-6 md:grid-cols-2 md:items-center md:gap-10"
      style={sectionAccentVars(section.accent)}
    >
      <div className="space-y-3">
        <div className="relative pl-4">
          <span
            aria-hidden
            className="absolute left-0 top-1.5 h-7 w-1 rounded-r-full"
            style={{ backgroundColor: "var(--section-accent)" }}
          />
          <h3 className="text-2xl font-semibold tracking-tight">{section.name}</h3>
          <p className="text-sm text-muted-foreground">{section.tagline}</p>
        </div>
        <p className="text-base leading-relaxed text-foreground/90">{section.explainer}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href={`/about/${section.slug}`}
            className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-90"
            style={{
              color: "var(--section-accent)",
              borderColor: "var(--section-accent-soft)",
              backgroundColor: "var(--section-accent-soft)",
            }}
          >
            Read more →
          </Link>
          <Link
            href={section.demoHref}
            className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            Try the demo
          </Link>
        </div>
      </div>
      <div
        className="overflow-hidden rounded-2xl border bg-muted/30 shadow-sm"
        style={{ borderColor: "var(--section-accent-soft)" }}
      >
        <picture>
          <source
            srcSet={section.screenshot.replace(/\.png$/, "-dark.png")}
            media="(prefers-color-scheme: dark)"
          />
          <Image
            src={section.screenshot}
            alt={`${section.name} screenshot — ${section.tagline}`}
            width={1200}
            height={800}
            className="h-auto w-full"
          />
        </picture>
      </div>
    </article>
  );
}

function HowDataWorks() {
  return (
    <section className="mb-20 max-w-xl space-y-4 text-base leading-relaxed sm:text-lg">
      <h2 className="text-2xl font-semibold tracking-tight">How the data works</h2>
      <p>
        Every event is a YAML file under{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          ~/Documents/septena-data/&lt;Section&gt;/Log/
        </code>
        . A meal looks like this:
      </p>
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed sm:text-sm">
        {`---
date: "2026-04-11"
time: "11:15"
protein_g: 22
fat_g: 14
carbs_g: 30
kcal: 340
foods: [Breakfast, 2 eggs, Coffee]
section: nutrition
---`}
      </pre>
      <p>
        Edit the files in any text editor. Back them up with git. Write scripts against them. If
        you stop using Septena, the files are still there and still readable.
      </p>
      <p>
        No account, no sync server, no cloud. For sync, put the folder in iCloud Drive or
        Dropbox, or <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">git push</code>{" "}
        it to a private repo.
      </p>
    </section>
  );
}

function Install() {
  return (
    <section
      id="install"
      className="mb-20 max-w-xl space-y-4 text-base leading-relaxed sm:text-lg"
    >
      <h2 className="text-2xl font-semibold tracking-tight">Install</h2>
      <p>
        Septena runs locally. Today that means a Node frontend and a Python backend talking to
        a folder on disk. A packaged Mac app and an iOS companion are in progress.
      </p>
      <p>
        For now you need Node and Python installed, and you run two local processes while using
        the app.
      </p>
      <ol className="list-decimal space-y-1 pl-6">
        <li>Clone the repo</li>
        <li>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">npm install</code> and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            pip install -r requirements.txt
          </code>
        </li>
        <li>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">npm run seed-demo</code>{" "}
          to populate demo data, or point{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            $SEPTENA_DATA_DIR
          </code>{" "}
          at an empty folder to start fresh
        </li>
        <li>
          Run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            uvicorn main:app --port 7000 --reload
          </code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">npm run dev</code>,
          then open <span className="font-mono text-sm">http://localhost:7777</span>
        </li>
      </ol>
      <p className="text-sm text-muted-foreground">
        Requires macOS (Linux should work; untested), Node 20+, Python 3.11+.
      </p>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border pt-8 text-sm text-muted-foreground">
      <p>
        Built by Michell Zappa. MIT licensed.{" "}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-foreground underline-offset-4 hover:text-brand-accent hover:underline"
        >
          Source on GitHub
        </a>
        .
      </p>
    </footer>
  );
}
