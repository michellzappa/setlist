# Backlog

Deferred ideas — not scheduled, not blocking, kept here so they don't
get re-discovered from scratch every time.

## Storage layer

- **Git-backed vault writes.** Storage today is plain YAML under
  `$SEPTENA_DATA_DIR`; the user can commit manually. Option on the table:
  run `git add <file> && git commit -m "..."` automatically from the
  write paths (one helper, called from each router's write). Gives free
  history, undo, and multi-device sync via a remote. Deferred because
  (a) manual commits work, (b) auto-commit couples the app to git being
  installed and the vault being a repo, (c) commit messages would be
  machine-generated noise unless we put effort in. Revisit if/when the
  user wants cross-device sync or an in-app "undo last change".

- **Generalise the storage backend** (SQLite / Supabase / Convex /
  PocketBase / etc). Routers currently read/write the filesystem
  directly. If we ever want to run on something other than YAML files,
  the shape would be an `EventStore` interface (`list / get / put /
  delete` + `get_config / put_config`) with YAML as one implementation.
  Not doing this now — we're committed to git/text.

## Insights

- **Widen correlation window** from 30d to 90/180d once enough data has
  accumulated. See `MEMORY.md` — `project_insights_roadmap.md`.

## Tasks section

Discussed in the Tasks v1 build session (2026-04-25). Sized as [S] / [M].
Order is rough priority — picks for "next round" called out in **bold**.

### Higher signal, low effort
- **Inline edit on TaskRow** [M] — click title to edit. Today only complete/undo works; fixing typos forces dropping into the .md.
- **Cancel from the UI** [S] — `POST /api/tasks/cancel` is wired but no button. Add to a row context-menu alongside Schedule.
- **`/api/tasks/events?action=` raw event feed** [S] — lets agents query "what did I make/defer/cancel last week?" without re-deriving from `/history`. Foundation for the digest skill below.
- **Per-area filter pills** [S] — clicking a row in "by area" balance card filters all views via existing `?area=` query.
- **Logbook search** [S] — small text input above Logbook; filter by title.

### Weekly reflection ethos
- **Weekly digest skill** [M] — Septena CLI/skill running Sunday, writes `~/septena-data/Reflections/{YYYY-WW}.md`: made/done/deferred totals, by-area balance, anything aging in Inbox >7d, "deferred 3+ times" offenders. The thing that makes the events log earn its keep.
- **"Aging in Inbox" surface** [S] — count + gentle line at bottom of Inbox view ("3 of these have been here over a week"). No red badge.
- **Defer count per task** [S] — derive from events log, store on the task. Surfaces the recurring offender pushed N times — commit or kill.

### Quality-of-life
- **CMD-K integration** [S] — register "New task…" in the existing command palette for global capture (today the quick-add only lives on the page + overview tile).
- **Drag-to-reorder within Today** [M] — Today is currently created-time order; manual order is a Things hallmark.
- **Natural-language quick-capture parser** [M] — `Buy milk #home tomorrow` parses inline. Real value if you log a lot from cmd-K.
- **Project page** [M] — `/septena/tasks/projects/{id}` with that project's tasks + notes. Projects are data-only today.

### Cross-section glue
- **Calendar overlay** [M] — render scheduled tasks on the calendar dashboard.
- **Chores ↔ Tasks bridge** [S] — repeatedly-deferred chore prompts "this might be a Task". Row-menu action to convert a one-off Task into a recurring Chore.
- **Insights correlation** [M] — "tasks done per day" vs sleep score / mood. The most "Septena-y" item on the list.

### Deferred indefinitely (stay calm, not Todoist)
Subtasks/checklists, tags, recurring tasks (Chores covers it), priorities, due-time-of-day, reminders/notifications, gamification, AI-suggested next-actions. Each drifts away from the Things tone the section was set up around.

**Picks for next round:** Inline edit, Cancel button, CMD-K registration, Weekly digest skill. First three remove daily friction; digest makes the events log earn its keep.

## Taxonomies

- Hardcoded taxonomies (`CAFFEINE_METHODS`, exercise cardio/mobility/
  core/lower defaults, frontend mirrors in `training-dashboard.tsx`)
  could move to per-section `{section}-config.yaml` + a
  `/api/{section}/config` route, mirroring how strains and beans already
  work. Not urgent — they're stable.
