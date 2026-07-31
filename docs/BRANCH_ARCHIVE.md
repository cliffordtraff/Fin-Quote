# Fin Quote Branch Archive

Last audited: July 29, 2026

`origin/main` is the canonical integration and deployment branch. Product
direction lives in `docs/CURRENT_ROADMAP.md`. Branches are implementation
history, not competing roadmaps.

## Active Branches

| Branch | Tip at audit | State | Decision |
|---|---:|---|---|
| `origin/main` | `2880043` | Canonical remote mainline | Deploy and branch from here |
| `main` | `910e949` | 12 commits behind `origin/main` | Fast-forward after active work is safe |
| `Newsletter-Chart-Edits` | `2880043` plus local work | Active feature integration; `origin/main` integrated | Finish checks, commit, then open a PR |
| `origin/financials-template` | `910e949` | Remote recovery anchor | Keep until newsletter work lands |

The active feature branch contains uncommitted work. A retained safety stash
from before the mainline integration provides an additional recovery point.
Do not reset, switch, or rebase the branch without first preserving the current
working tree.

## Local Branches Retained

Ten local branches remain after cleanup:

| Branch | Why it remains |
|---|---|
| `Newsletter-Chart-Edits` | Current work |
| `main` | Local mainline pointer |
| `Watchlist-Header` | Not merged into `origin/main` |
| `feature/landing-and-dashboard2` | Not merged into `origin/main` |
| `feature/watchlist-integration` | Not merged into `origin/main` |
| `fix/scroll-positioning-instant` | Not merged into `origin/main` |
| `concept-chart` | Local tip is ahead of its remote tracking branch |
| `feature/vertical-layout` | Local tip is ahead of its remote tracking branch |
| `feature/ratio-mvp` | Local tip is ahead of its remote tracking branch |
| `feature/active-learning-review` | Local tip is ahead of its remote tracking branch |

The four upstream-divergent branches are represented in the broader mainline
history, but their local tips are intentionally retained until their unique
commits are tagged or explicitly discarded.

## Cleanup Performed

Thirty-seven local branch pointers that were fully represented in
`origin/main` were removed during this audit. No remote branch was deleted and
no commit content was rewritten.

Examples include old dashboard layouts, newsletter experiments, charting
experiments, provider migrations, chatbot work, and theme branches. Remote refs
or the git reflog can recover those tips if historical inspection is needed.

## Remote Branch Policy

There are 45 `origin/*` refs at this audit. They fall into three groups:

1. `origin/main`: canonical.
2. Recent PR/source branches from July 2026: retain until their merged or
   superseded status is confirmed on GitHub.
3. Older branches already contained by main: remote archive/deletion
   candidates.

Remote deletion is intentionally separate from local cleanup because it affects
every collaborator. When it is performed, first tag any branch that remains
useful as a named historical milestone.

Recent branches requiring a GitHub-side disposition check:

- `origin/agent/cache-public-market-pages`
- `origin/agent/fix-canonical-robots`
- `origin/agent/fix-concept-hydration`
- `origin/agent/fix-insider-data-sanity`
- `origin/agent/harden-insider-ranking`
- `origin/codex/reduce-vercel-cpu`
- `origin/feature/wiim-warm-hardening`

## Branch Rules

- Create new work from the latest `origin/main`.
- Use one branch per coherent deliverable.
- Merge through pull requests.
- Delete local merged branches after the PR lands.
- Delete remote merged branches after the retention window.
- Use tags for durable milestones instead of duplicate repo folders.
- Never store credentials, generated newsletter assets, or local review JSON in
  a branch.

## Recovery Commands

Refresh remote references:

```bash
git fetch --prune origin
```

Inspect a remote branch without creating another repository copy:

```bash
git log --oneline origin/branch-name
git diff origin/main...origin/branch-name
```

Create a local recovery branch from a retained remote:

```bash
git switch -c recovery/branch-name origin/branch-name
```
