---
name: interface-design
description: Use when designing or redesigning product UI for dashboards, admin panels, SaaS apps, maps, settings, tables, or other application interfaces in this repository. Not for marketing pages or landing pages.
---

# Interface Design

Project-scoped Codex skill for interface design work in this repository.

Use this skill when the user asks to:
- design or redesign dashboard pages
- improve application UI craft or consistency
- create or refine admin screens, map screens, tables, cards, filters, or settings
- establish or apply a reusable interface system

Do not use this skill for marketing sites or landing pages.

## Required Flow

1. Read `.interface-design/system.md` if it exists.
2. Read only the reference files you need from `references/`.
3. Inspect the relevant product area before proposing edits.
4. Before writing UI code, state the design direction briefly:
   - Intent
   - Palette
   - Depth
   - Surfaces
   - Typography
   - Spacing
5. If key intent is unclear, ask the user concise clarifying questions before editing.
6. After implementing, run a self-critique against the checks in `references/validation.md`.
7. If the work establishes or changes patterns materially, offer to save them to `.interface-design/system.md`.

## Repository Context

This repository is a GPS fleet tracking platform with:
- a real-time tracking dashboard
- map-heavy workflows
- devices, vehicles, alerts, geofences, history, and reports

When working here, bias toward:
- operational clarity over decorative UI
- dense but readable data presentation
- map and telemetry context as first-class design inputs
- consistent surfaces and controls across dashboard modules

## Design Rules

- Do not default to generic dashboard layouts.
- Every major visual choice needs a reason tied to the user's task.
- Prefer subtle hierarchy, restrained accents, and deliberate spacing.
- Make the design feel specific to tracking, operations, and fleet workflows when relevant.
- Preserve the existing design system unless the user asked for a broader redesign.

## References

Read these selectively:
- `references/principles.md`
  Use for core craft principles and anti-generic guidance.
- `references/validation.md`
  Use before claiming the UI is complete.
- `references/critique.md`
  Use when refining a first pass that feels correct but generic.
- `references/example.md`
  Use when you need an example of how to state intent and system choices.

## Output Expectations

When you respond during UI work, keep the framing brief and concrete. Prefer:

```text
Intent: ...
Palette: ...
Depth: ...
Surfaces: ...
Typography: ...
Spacing: ...
```

Then implement.

If the user asks to "use interface-design", "use the interface design skill", or asks for a UI redesign of an app surface in this repo, activate this skill.
