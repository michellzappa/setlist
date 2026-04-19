---
name: setlist-adding-a-section
description: End-to-end guide to add a brand-new section to Setlist (e.g. Groceries, Mood, Water, Mood, Reading). Covers vault layout, backend router, frontend dashboard, nav registry, and the section's own SKILL.md so it's agent-legible from day one.
---

# Adding a new section

Sections are the main unit of extension in Setlist. Adding one means
teaching the backend to read a new folder of YAML files, wiring a React
dashboard to visualize them, and — critically — writing a `SKILL.md` so
agents can log into it alongside the core sections.

## When to use this skill

- User wants to track something Setlist doesn't currently support
  (groceries, water intake, mood, reading, meditation, expenses…).
- User wants to fork a section (e.g. add a "Workouts" section separate
  from "Exercise" for a different framing).

## Pick your section archetype

Copy the one that matches the data shape you need:

| Archetype | Example | Pattern | Copy from |
|---|---|---|---|
| **Per-event log** | meals, workouts, drinks, mood check-ins | One file per event, timestamped | Nutrition or Caffeine |
| **Fixed-set checklist** | habits, supplements | Config file lists items; one file per completion | Habits or Supplements |
| **Cadence-based tasks** | chores, maintenance | Definition files + per-completion log | Chores |
| **Integration-backed** | sleep, body weight | No vault folder; reads external API | Sleep / Body (see `skills/integrations/`) |

## Minimal six-step recipe

Assume we're adding **Groceries** (per-event log pattern — one file per
shopping event).

### 1. Pick the vault folder and YAML shape

`$SETLIST_VAULT/Groceries/Log/YYYY-MM-DD--HHMM--NN.md`:

```yaml
---
date: "2026-04-20"
time: "14:15"
id: "groceries-2026-04-20-14-15"
section: groceries
store: "Albert Heijn"
items:
  - 1kg chicken breast
  - avocados
  - oat milk
total_eur: 24.50
note: null
---
```

Universal fields (`date`, `time`, `id`, `section`) first; section-specific
fields flat after. No nesting unless it's semantically necessary.

### 2. Add a backend router

`api/routers/groceries.py`:

```python
from fastapi import APIRouter
from api.paths import VAULT_ROOT
from api.parsing import extract_frontmatter, normalize_date

GROCERIES_DIR = VAULT_ROOT / "Groceries/Log"
router = APIRouter(prefix="/api/groceries", tags=["groceries"])


@router.get("/entries")
def entries(days: int = 30):
    # glob + parse + sort — see api/routers/nutrition.py for a fuller example
    ...


@router.post("/entry")
async def new_entry(payload: dict):
    # write one YAML file to GROCERIES_DIR
    ...
```

Then mount it in `api/app.py` alongside the other routers.

### 3. Register in backend auto-detect

In `api/routers/meta.py` add `"groceries": "Groceries"` to
`_VAULT_FOLDER_SECTIONS`. That's it — now `/api/config` reports the
section as available when the folder exists, and `/api/sections` sets
`enabled: true` by default for users with the folder.

### 4. Register in frontend

`lib/sections.ts`:

```ts
groceries: {
  key: "groceries",
  label: "Groceries",
  path: "/groceries",
  apiBase: "/api/groceries",
  obsidianDir: "Bases/Groceries/Log",
  color: "hsl(130,55%,45%)",
  tagline: "Shopping runs, items & spend",
  emoji: "🛒",
},
```

Also add `groceries` to the `SectionKey` union type.

### 5. Build the dashboard

Create `app/groceries/page.tsx` + `components/groceries-dashboard.tsx`.
Copy the nearest archetype — Caffeine or Cannabis for per-event log
patterns, Habits for fixed-set. Replace the section-specific fields.

Plus an API-client block in `lib/api.ts` under a `// ── Groceries ──`
comment — types + fetch functions matching your router.

### 6. Ship the skill

Write `examples/vault/Bases/Groceries/SKILL.md` (or `optional/…` if
it's not core to most users). Structure:

```markdown
---
name: setlist-groceries
description: Log grocery-shopping events with store, items, spend.
---

# Setlist · Groceries

## Where it lives
## Filename
## YAML schema
## How to use this skill
## Example interactions
```

Mirror the shape of the existing SKILL.md files for consistency — an
agent that's loaded one Setlist skill should recognize the shape of
any other.

Also add your section to the index tables in [`SKILLS.md`](../SKILLS.md)
and to the HTTP API reference in [`skills/http-api.md`](http-api.md).

## Is it core or optional?

Rule of thumb: put it in `examples/vault/Bases/` if it answers yes to
all three:

1. **Universal?** Most users would want to track this, not just me.
2. **Core to health?** The app's North Star is personal health — does
   this section serve that, or is it adjacent (finance, reading, etc.)?
3. **Low configuration overhead?** Users shouldn't need to set up a
   database, API token, or external service.

Otherwise, `examples/vault/optional/` is the honest place. Users copy
it in when they want it.

## Integration-backed sections (no vault folder)

If the data source is an external API or snapshot file (like Sleep from
Oura), the pattern is different:

- No vault folder — data comes from an integration token or a file
  outside the vault (typically under `$SETLIST_INTEGRATIONS_DIR`).
- Backend router reads + aggregates the external data.
- In `api/routers/meta.py`'s `_available_sections`, gate the section on
  the integration being reachable instead of folder presence.
- Skill file lives in `skills/integrations/<section>.md`, not
  `examples/vault/`.
- Write-related endpoints usually aren't applicable — it's a read-only
  window into someone else's system.

See [`skills/integrations/sleep.md`](integrations/sleep.md) for a worked
example.

## Agent-friendly new-section checklist

Before declaring the section done, verify:

- [ ] Folder exists at `$SETLIST_VAULT/<Section>/` with a `Log/` or
      `Definitions/` subfolder
- [ ] A starter config YAML exists if the section has config (otherwise
      skip)
- [ ] `api/routers/<section>.py` with at least one `GET` and one `POST`
      (unless read-only)
- [ ] Router mounted in `api/app.py`
- [ ] `meta.py` `_VAULT_FOLDER_SECTIONS` updated so auto-detect works
- [ ] `lib/sections.ts` has the entry + `SectionKey` union updated
- [ ] `lib/api.ts` has typed client functions
- [ ] `app/<section>/page.tsx` + `components/<section>-dashboard.tsx`
- [ ] `examples/vault/.../{Section}/SKILL.md` with the three core
      sections: Schema, How to use, Example interactions
- [ ] `SKILLS.md` index updated
- [ ] `skills/http-api.md` endpoint table updated
