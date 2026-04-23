#!/usr/bin/env python3
"""One-shot migration: canonicalize the Training section on disk.

Moves legacy `Exercise/` storage to `Training/`, renames
`exercise-config.yaml` to `training-config.yaml`, and rewrites
`settings.yaml` aliases (`exercise` -> `training`,
`exercise_complete` -> `training_complete`).

Usage:
    python3 scripts/migrate_training_section.py
    python3 scripts/migrate_training_section.py --apply
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from api.paths import DATA_ROOT


def split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---"):
        raise ValueError("missing frontmatter")
    end = text.find("\n---", 3)
    if end == -1:
        raise ValueError("unterminated frontmatter")
    fm_raw = text[3:end].strip()
    body = text[end + 4 :].lstrip("\n")
    fm = yaml.safe_load(fm_raw) or {}
    if not isinstance(fm, dict):
        raise ValueError(f"frontmatter is not a mapping: {type(fm)}")
    return fm, body


def format_frontmatter(frontmatter: dict[str, Any], body: str) -> str:
    dumped = yaml.safe_dump(
        frontmatter,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    )
    if body:
        return f"---\n{dumped}---\n\n{body}"
    return f"---\n{dumped}---\n"


def canonicalize_settings(data: dict[str, Any]) -> dict[str, Any]:
    out = dict(data)

    raw_order = out.get("section_order")
    if isinstance(raw_order, list):
        order: list[str] = []
        seen: set[str] = set()
        for item in raw_order:
            key = "training" if str(item) == "exercise" else str(item)
            if key in seen:
                continue
            seen.add(key)
            order.append(key)
        out["section_order"] = order

    raw_sections = out.get("sections")
    if isinstance(raw_sections, dict):
        sections = dict(raw_sections)
        training_meta = sections.get("training")
        exercise_meta = sections.get("exercise")
        if isinstance(training_meta, dict) and isinstance(exercise_meta, dict):
            merged = dict(exercise_meta)
            merged.update(training_meta)
            sections["training"] = merged
        elif "training" not in sections and "exercise" in sections:
            sections["training"] = sections["exercise"]
        sections.pop("exercise", None)
        out["sections"] = sections

    raw_animations = out.get("animations")
    if isinstance(raw_animations, dict):
        animations = dict(raw_animations)
        if "training_complete" not in animations and "exercise_complete" in animations:
            animations["training_complete"] = animations["exercise_complete"]
        animations.pop("exercise_complete", None)
        out["animations"] = animations

    return out


def rewrite_section_frontmatter(log_dir: Path) -> dict[Path, str]:
    rewrites: dict[Path, str] = {}
    if not log_dir.exists():
        return rewrites
    for path in sorted(log_dir.glob("*.md")):
        try:
            frontmatter, body = split_frontmatter(path.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if frontmatter.get("section") != "exercise":
            continue
        frontmatter["section"] = "training"
        rewrites[path] = format_frontmatter(frontmatter, body)
    return rewrites


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    data_root = DATA_ROOT
    legacy_root = data_root / "Exercise"
    canonical_root = data_root / "Training"
    settings_path = data_root / "Settings" / "settings.yaml"

    planned_move: tuple[Path, Path] | None = None
    warnings: list[str] = []

    if legacy_root.exists() and canonical_root.exists():
        warnings.append(
            "Both Exercise/ and Training/ exist; skipping directory move to avoid merging two trees automatically.",
        )
    elif legacy_root.exists() and not canonical_root.exists():
        planned_move = (legacy_root, canonical_root)

    log_dirs = [path for path in {legacy_root / "Log", canonical_root / "Log"} if path.exists()]
    frontmatter_rewrites: dict[Path, str] = {}
    for log_dir in log_dirs:
        frontmatter_rewrites.update(rewrite_section_frontmatter(log_dir))

    settings_rewrite: dict[str, Any] | None = None
    if settings_path.exists():
        raw = yaml.safe_load(settings_path.read_text(encoding="utf-8")) or {}
        if isinstance(raw, dict):
            rewritten = canonicalize_settings(raw)
            if rewritten != raw:
                settings_rewrite = rewritten

    config_renames: list[tuple[Path, Path]] = []
    for root in (legacy_root, canonical_root):
        old_path = root / "exercise-config.yaml"
        new_path = root / "training-config.yaml"
        if old_path.exists() and not new_path.exists():
            config_renames.append((old_path, new_path))

    print(f"data root: {data_root}")
    if planned_move:
        print(f"move section dir: {planned_move[0].name} -> {planned_move[1].name}")
    else:
        print("move section dir: none")

    print(f"config renames: {len(config_renames)}")
    for old_path, new_path in config_renames:
        print(f"  MV  {old_path} -> {new_path}")

    print(f"settings rewrite: {'yes' if settings_rewrite is not None else 'no'}")
    print(f"frontmatter rewrites: {len(frontmatter_rewrites)}")
    for path in frontmatter_rewrites:
        print(f"  RW  {path}")

    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)

    if not args.apply:
        print("\n(dry run — pass --apply to write)")
        return 0

    for path, content in frontmatter_rewrites.items():
        path.write_text(content, encoding="utf-8")

    if settings_rewrite is not None:
        settings_path.write_text(
            yaml.safe_dump(settings_rewrite, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )

    for old_path, new_path in config_renames:
        new_path.parent.mkdir(parents=True, exist_ok=True)
        old_path.rename(new_path)

    if planned_move:
        planned_move[1].parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(planned_move[0]), str(planned_move[1]))

    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
