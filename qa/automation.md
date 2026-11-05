# QA automation plan — opencode-plugin-docs-open

Five-step QA pipeline per delivery lot (new rules → regression → black-box
resilience → app coherence → CI automation). This plan is the step-5 ledger.

## Automated in CI (GitHub Actions, push/PR)

| Job | Covers | Pipeline step |
|---|---|---|
| `test` | vitest (domain, application, adapter mapping) + bun headless harness (the real TUI `setup` + click chain, incl. the D2a regression) + `tsc --noEmit` | 1 (lot rules) + 2 (regression) |
| `scrub` | structural leak & temporary-trace audit: absence of `DOCS_OPEN_DEBUG` in `src`/`test` + no home paths (`/home/<x>/`, `/Users/<x>/`) in the checkout | publication rules + 1 |

## Pre-publication (maintainer, local — deliberately not committed)

Before each publication (bundle rebuild / tag / push), run a personal-token
scrub of the whole checkout **locally**: the maintainer's names, employer,
e-mail provider and personal directory structure, over every file including
the lockfile. The pattern is intentionally not written anywhere in this repo —
a personal leak pattern published in a public repo would be a leak in itself
(2026-11-04 audit, finding B-3). The CI `scrub` job covers the structural,
non-identifying checks; the personal-token scrub is the maintainer's local
gate, run on every publication.

## Manual (real TUI — not testable headless under node)

- **Click chain & surfaces**: `/docs` dialog → open, running-text click → open,
  fence line click → open, non-doc / missing / composer / drag / modified clicks →
  inert, real viewer (no fake) opens the right file.
- **Crash registry black box**: replay the registered crash triggers in `qa/crash-cases/`
  (each case names its manual black-box procedure), in a fresh TUI process.
- **Limitation re-tests at each host bump** (D3 / D9): AC-8/AC-12 (link styling,
  hover), the standard code-block visual marker, AC-20 opt-out (host option
  propagation). A host bump invalidates these — re-run and update the registry.

## Crash case registry

`qa/crash-cases/` — every crash found in a QA cycle is registered here with its
root cause, fix, automated regression and black-box procedure. A registered case
must be **consumed each cycle** (its regression test runs in CI; its black box runs
in the manual pass). Current: 1 case (D2a).

## KPI — manual QA time per cycle

- **Cycle 1 baseline (2026-11-04)**: ≈ 75–90 min of manual work (real-TUI
  click chain + black box + crash-registry replay), estimated from the
  three-expert audit pass. Target: decreasing per cycle as the automated
  surface grows — the per-cycle value goes on the QA scorecard.

## Candidates for the next cycle

- CI: a doc-surface check asserting README/CHANGELOG fence wording matches the code
  (today: step-4 coherence pass, manual).
- CI: run the harness under a pinned host-version fixture when the host publishes a
  testable renderer (today: bun test renderer only).
