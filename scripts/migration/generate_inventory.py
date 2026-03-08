#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = ROOT / "fincept-terminal-desktop" / "src"
TAURI_ROOT = ROOT / "fincept-terminal-desktop" / "src-tauri" / "src"
OUTPUT_DIR = ROOT / "docs" / "migration" / "generated"

INVOKE_RE = re.compile(r"invoke\('([^']+)'")
TAURI_IMPORT_RE = re.compile(r"@tauri-apps/([a-zA-Z0-9/_-]+)")
COMMAND_RE = re.compile(r"#\[(?:tauri::)?command\]")


def iter_files(base: Path, suffixes: tuple[str, ...]) -> list[Path]:
    return [path for path in base.rglob("*") if path.is_file() and path.suffix in suffixes]


def collect_frontend_invokes() -> dict[str, list[str]]:
    usage: dict[str, list[str]] = defaultdict(list)
    for path in iter_files(FRONTEND_ROOT, (".ts", ".tsx")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in INVOKE_RE.finditer(text):
            usage[match.group(1)].append(str(path.relative_to(ROOT)))
    return dict(sorted(usage.items()))


def collect_tauri_imports() -> dict[str, list[str]]:
    usage: dict[str, list[str]] = defaultdict(list)
    for path in iter_files(FRONTEND_ROOT, (".ts", ".tsx")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in TAURI_IMPORT_RE.finditer(text):
            usage[match.group(1)].append(str(path.relative_to(ROOT)))
    return {key: sorted(set(value)) for key, value in sorted(usage.items())}


def collect_rust_commands() -> dict[str, int]:
    commands: dict[str, int] = {}
    for path in iter_files(TAURI_ROOT, (".rs",)):
        text = path.read_text(encoding="utf-8", errors="ignore")
        count = len(COMMAND_RE.findall(text))
        if count:
            commands[str(path.relative_to(ROOT))] = count
    return dict(sorted(commands.items()))


def build_inventory() -> dict[str, object]:
    frontend_invokes = collect_frontend_invokes()
    tauri_imports = collect_tauri_imports()
    rust_commands = collect_rust_commands()

    return {
        "summary": {
            "frontend_invoke_count": len(frontend_invokes),
            "frontend_tauri_module_count": len(tauri_imports),
            "rust_command_annotation_count": sum(rust_commands.values()),
        },
        "frontend_invokes": frontend_invokes,
        "frontend_tauri_imports": tauri_imports,
        "rust_command_files": rust_commands,
    }


def render_markdown(inventory: dict[str, object]) -> str:
    summary = inventory["summary"]
    frontend_invokes: dict[str, list[str]] = inventory["frontend_invokes"]  # type: ignore[assignment]
    tauri_imports: dict[str, list[str]] = inventory["frontend_tauri_imports"]  # type: ignore[assignment]
    rust_commands: dict[str, int] = inventory["rust_command_files"]  # type: ignore[assignment]

    lines = [
        "# Migration Inventory",
        "",
        "## Summary",
        "",
        f"- Frontend invoke calls: `{summary['frontend_invoke_count']}`",
        f"- Frontend Tauri modules: `{summary['frontend_tauri_module_count']}`",
        f"- Rust command annotations: `{summary['rust_command_annotation_count']}`",
        "",
        "## Frontend Invokes",
        "",
        "| Command | Usage count | Example files | Migration bucket | Status |",
        "| --- | ---: | --- | --- | --- |",
    ]

    for command, files in frontend_invokes.items():
        examples = ", ".join(files[:3])
        lines.append(f"| `{command}` | {len(files)} | {examples} | TBD | non commence |")

    lines.extend([
        "",
        "## Frontend Tauri Imports",
        "",
        "| Module | Files |",
        "| --- | --- |",
    ])
    for module, files in tauri_imports.items():
        lines.append(f"| `{module}` | {', '.join(files[:5])} |")

    lines.extend([
        "",
        "## Rust Command Files",
        "",
        "| File | Command annotations |",
        "| --- | ---: |",
    ])
    for path, count in rust_commands.items():
        lines.append(f"| `{path}` | {count} |")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    inventory = build_inventory()

    json_path = OUTPUT_DIR / "inventory.json"
    json_path.write_text(json.dumps(inventory, indent=2), encoding="utf-8")

    md_path = OUTPUT_DIR / "inventory.md"
    md_path.write_text(render_markdown(inventory), encoding="utf-8")

    if args.format == "markdown":
        print(md_path.read_text(encoding="utf-8"))
    else:
        print(json.dumps(inventory, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
