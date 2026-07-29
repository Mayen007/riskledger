# RiskLedger

Not another vulnerability scanner. RiskLedger decides what to patch, what to flag, and what to accept — and keeps a durable, auditable record of every call.

It's a GitHub App that triages dependency vulnerabilities the way a careful maintainer would — not just flagging every `npm audit` hit, but deciding what's safe to auto-patch, what needs a human, and what genuinely doesn't apply to your codebase, with every decision logged in the repo itself.

## Why this exists

Dependabot and `npm audit` are good at finding vulnerabilities and bad at reasoning about them. They'll flag a CVE in a code path your app never touches with the same urgency as one sitting in your auth flow, and they leave you to re-litigate the same "is this actually a risk for us" question every time it resurfaces. RiskLedger encodes that judgment once, as policy, and applies it consistently:

- **Auto-patches** what has a safe semver-compatible fix
- **Flags for review** what's ambiguous or high-severity
- **Marks as accepted risk** what your policy file says doesn't apply — with a reason, on record, instead of a silently dismissed audit warning

## How it works

```
GitHub webhook (push / scheduled run)
        │
        ▼
   Probot app (Node.js webhook handler)
        │
        ▼
   Audit runner (npm audit / pip-audit)
        │
        ▼
   Classifier (patchable vs. accepted risk)
        │
   ┌────┴────┐
   ▼         ▼
Open PR   Post comment
(safe      (explains
 bump)      skipped fix)
   │         │
   └────┬────┘
        ▼
  Risk log (accepted-risks.md in repo)
```

1. A push, PR, or scheduled cron triggers a scan.
2. The audit runner shells out to the relevant tooling for the ecosystem (`npm audit`, `pip-audit`, extensible to others) and returns findings as structured JSON.
3. The classifier checks each finding against semver-patchability and your repo's policy file, then routes it.
4. Patchable findings get batched into a PR. Non-applicable or ambiguous findings get a comment explaining why, plus an entry in the risk log.

## Features

### Core (v1)

- Triggers on push, PR open, and a weekly scheduled full-repo scan
- `npm audit` and `pip-audit` support out of the box
- Auto-patch PRs for semver-safe fixes, batched sensibly (minor bumps grouped, majors kept separate)
- Explanatory comments for anything not auto-fixed
- Every decision — patched or accepted — written to `accepted-risks.md`
- Zero-config install: pick repos, done

### Classification intelligence

- `.security-policy.json` lets you declare unused features or modes (e.g. "we don't use RSC") so the classifier can rule out CVEs that don't apply to your usage
- Severity-aware routing — critical/high always goes to human review regardless of patchability
- Dedup logic so one CVE across multiple packages doesn't spam separate comments
- `/recheck` command to re-run classification after you update policy

### PR and comment behavior

- PR descriptions include CVE IDs, severity, changelog links, and a diff summary
- Auto-applied labels: `security`, `auto-patch`, `needs-review`
- Optional auto-merge for low-risk patch-level bumps when CI passes
- Comments update in place instead of duplicating on every run

### Reporting

- Weekly digest summarizing patched / open / accepted-risk counts
- Optional status badge for the README
- Optional cross-repo dashboard for maintainers running the bot on multiple projects

### Notifications

- Slack/Discord webhook for critical findings
- Email digest fallback

## Tech stack

| Layer         | Choice                                                       |
| ------------- | ------------------------------------------------------------ |
| Framework     | [Probot](https://probot.github.io/) (Node.js)                |
| Language      | TypeScript                                                   |
| GitHub API    | Octokit (bundled with Probot)                                |
| Audit tooling | `npm audit`, `pip-audit` via `child_process`                 |
| Scheduling    | GitHub Actions cron, or serverless cron if self-hosted       |
| Storage       | None — state lives in `accepted-risks.md` in each repo       |
| Testing       | Jest + Probot's testing helpers, `nock` for mocked API calls |
| Local dev     | [smee.io](https://smee.io) to proxy webhooks                 |

## Installation

1. Install RiskLedger from `github.com/apps/riskledger` (or your own hosted instance) and select the repos you want it to watch.
2. RiskLedger requests:
   - **Contents**: read/write — to open patch PRs and update the risk log
   - **Pull requests**: write — to open and comment on PRs
   - **Issues**: write — to post risk comments
3. Optionally drop a `.security-policy.json` in the repo root (see below). Without one, RiskLedger uses conservative defaults — nothing is auto-marked as accepted risk.

## Configuration

`.security-policy.json` in your repo root:

```json
{
  "unusedFeatures": {
    "rsc": false,
    "ssr": false
  },
  "autoMergePatchLevel": false,
  "autoPatch": {
    "minSeverity": "low",
    "maxSeverity": "medium"
  },
  "notify": {
    "slackWebhook": null
  }
}
```

| Field                                   | Description                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `unusedFeatures`                        | Feature flags the classifier checks against a CVE's affected surface before ruling it non-applicable |
| `autoMergePatchLevel`                   | If `true`, patch-level auto-PRs merge automatically once CI passes                                   |
| `autoPatch.minSeverity` / `maxSeverity` | Severity range eligible for auto-patching; anything above `maxSeverity` always goes to human review  |
| `notify.slackWebhook`                   | Optional webhook URL for critical-finding alerts                                                     |

**Trust boundary:** `.security-policy.json` controls what the classifier is allowed to wave through, which makes it a target in its own right — a PR that quietly loosens it and lands a real vulnerability in the same or a follow-up change would otherwise sail through as "accepted risk." Any PR touching this file is always routed to human review, regardless of `autoMergePatchLevel` or anything else the new policy claims. We'd also recommend adding it to your repo's `CODEOWNERS` so only maintainers can approve changes to it.

## Commands

Comment these on an issue or PR RiskLedger has opened. Both commands check that the commenter has `write` or `admin` access to the repo before doing anything — a commenter without that access gets a reply explaining the command was ignored, not a silent no-op and not an executed action.

- `/recheck` — re-run classification against the current policy file
- `/accept <reason>` — manually mark a flagged finding as accepted risk, logged with your GitHub handle

## Project structure

```
.
├── src/
│   ├── index.ts              # Probot app entry point, event handlers
│   ├── audit/
│   │   ├── runAudit.ts       # shells out to npm audit / pip-audit
│   │   └── parseFindings.ts  # normalizes output across ecosystems
│   ├── classify/
│   │   ├── classify.ts       # core patchable vs. accepted-risk logic
│   │   └── loadPolicy.ts     # reads .security-policy.json
│   ├── actions/
│   │   ├── openPatchPR.ts
│   │   ├── postRiskComment.ts
│   │   └── appendToRiskLog.ts
│   └── commands/
│       ├── recheck.ts
│       ├── accept.ts
│       └── checkCommenterRole.ts  # write/admin check, shared by both commands
├── test/
│   └── fixtures/              # sample audit output for tests
├── .security-policy.json      # example policy (this repo's own)
├── app.yml                    # GitHub App manifest
└── package.json
```

## Local development

```bash
npm install
npm run build
npx smee -u https://smee.io/your-channel -t http://localhost:3000/api/github/webhooks
npm start
```

Point your GitHub App's webhook URL at the smee.io channel while developing. Tests run against fixture audit output rather than live GitHub API calls:

```bash
npm test
```

## Roadmap

- Pluggable audit backends (`cargo audit`, `bundle audit`) without touching core classification logic
- Custom classification rules via a small config-as-code DSL
- Org-level default policy with per-repo overrides
- GitHub Marketplace listing with per-repo pricing

## License

MIT
