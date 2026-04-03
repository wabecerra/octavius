# Research: NPX Installer Options for Octavius

**Date:** 2026-04-03
**Scope:** Evaluate approaches for distributing Octavius as a self-hosted project installer
**Recommendation:** Enhanced setup script with optional degit/tiged support (Option C)

---

## Executive Summary

After researching how create-next-app, create-t3-app, create-vite, and similar tools work architecturally, and evaluating alternatives like degit, tiged, and GitHub template repos, the clear recommendation for Octavius is: **do not build a create-octavius-app npm package**. Instead, enhance the existing `scripts/setup.mjs` and document a one-liner using `npx tiged`. This gives you 90% of the user experience at 5% of the maintenance cost.

The core reason: create-\* packages solve a problem Octavius does not have. They exist for projects with many configuration permutations (TypeScript vs JavaScript, multiple frameworks, multiple ORMs, auth providers, etc.). Octavius is a single opinionated stack with no variant selection needed. A full create-\* package would be over-engineering.

---

## Problem Context

Octavius is a self-hosted Next.js 14 dashboard (personal "Life OS") with SQLite, Phaser 3, and OpenClaw integration. The project already has:

- A solid `scripts/setup.mjs` that handles env generation, data directory creation, dependency installation, and gateway detection
- A `bin/octavius` CLI for device approval
- A clear Quick Start in README (clone, `npm run setup`, `npm run dev`)
- The project is marked `"private": true` in package.json

The question: should the installation experience be improved, and if so, how?

---

## Solution Options

### Option A: Full `create-octavius-app` NPM Package

**How it works:** Publish a separate npm package named `create-octavius-app`. Users run `npx create-octavius-app` or `npm init octavius-app`. The package contains CLI logic that prompts for configuration, copies templates, and runs setup.

**Architecture of real create-\* tools:**

| Tool | Lines of code | Templates | Config permutations | Weekly downloads |
|------|--------------|-----------|---------------------|-----------------|
| create-next-app | ~2000+ | 2 (JS/TS) x router types | ~20+ combinations | 1M+ |
| create-t3-app | ~3000+ | Dynamic generation | ~64 combinations | 100K+ |
| create-vite | ~550 | 16+ framework templates | ~32 combinations | 2M+ |

**What you would need to build:**

1. A separate npm package (new repo or monorepo setup)
2. CLI argument parsing (commander, mri, or yargs)
3. Interactive prompts (@clack/prompts or inquirer)
4. Template copying logic
5. Package manager detection
6. Post-install setup (what setup.mjs already does)
7. npm publishing pipeline and versioning
8. Keep templates in sync with the main Octavius repo

**Pros:**
- Professional "brand" feel (`npx create-octavius-app`)
- Could add prompts for optional features in the future
- Standard pattern that developers recognize

**Cons:**
- Significant upfront development (estimate: 2-4 days)
- Ongoing maintenance burden: every time Octavius changes, the create package templates must be updated
- Template drift is a real and common problem (templates get out of sync with the main project)
- npm publishing overhead (tokens, CI, versioning)
- Octavius has exactly ONE configuration -- there are no variants to choose from
- The project is personal/self-hosted, not a framework used by thousands
- You would need to un-mark the project as `"private": true` or maintain a separate package

**Verdict:** Overkill. This pattern exists for multi-variant framework scaffolding. Octavius has one stack, one config.

---

### Option B: GitHub Template Repository

**How it works:** Mark the Octavius GitHub repo as a "template repository" in Settings. Users click "Use this template" on GitHub to create their own copy.

**What happens:**
- GitHub creates a new repo with the same file structure
- No git history is copied (clean start)
- User gets their own repo they can push to
- They still need to clone locally and run setup

**Pros:**
- Zero maintenance -- it always reflects the current state of the repo
- Built into GitHub, no tooling needed
- Users get their own repo automatically
- One-click on GitHub

**Cons:**
- Requires visiting GitHub (not a terminal-first experience)
- No post-clone automation (user still needs to run setup manually)
- Cannot run prompts or customize during creation
- Does not support Git LFS files
- Less discoverable than an npx command

**Verdict:** Good as a supplementary option, but not sufficient alone. Worth enabling (it is literally a checkbox in repo settings) but the terminal experience matters for developer tools.

---

### Option C: Enhanced Setup Script + degit/tiged One-Liner (RECOMMENDED)

**How it works:** Keep the existing `scripts/setup.mjs` as the primary setup mechanism. Document a one-liner in the README that uses tiged (actively maintained degit fork) to scaffold:

```bash
npx tiged wabecerra/octavius my-octavius && cd my-octavius && npm run setup
```

Or, even better, create a thin shell script / npx-runnable script that wraps this:

```bash
npx tiged wabecerra/octavius my-dashboard && cd my-dashboard && node scripts/setup.mjs
```

**What degit/tiged does:**
- Downloads the latest commit as a tarball (no git history)
- Extracts to the target directory
- Works with GitHub, GitLab, BitBucket
- Supports branches, tags, commit hashes (`repo#branch`)
- Cached locally for offline use
- No npm publishing needed on your end

**degit vs tiged:**
- degit: Original by Rich Harris, not actively maintained since ~2020
- tiged: Community fork, actively maintained, adds default branch auto-detection, Windows fixes, more git providers
- tiged is backward-compatible and installs as both `tiged` and `degit` commands
- **Use tiged**

**Pros:**
- Zero maintenance on your end -- tiged is maintained by others
- Always pulls the latest code from your repo (no template drift)
- Terminal-first experience that developers expect
- One-liner is just as memorable as `npx create-octavius-app`
- Your existing setup.mjs already handles all post-clone configuration
- No npm publishing, no versioning, no separate package
- Users can target specific branches/tags: `npx tiged wabecerra/octavius#v2.0`

**Cons:**
- Slightly less "polished" than a branded create-\* command
- Depends on tiged being maintained (but it is actively maintained, and degit works as fallback)
- No interactive prompts during scaffolding (but Octavius has nothing to prompt for)
- Users need to know the GitHub path (solved by documenting it prominently)

**Verdict:** Best fit for Octavius. Zero maintenance, always current, good developer experience.

---

### Option D: `npm init` with a Thin Wrapper

**How it works:** `npm init <name>` translates to `npx create-<name>`. You could publish a minimal `create-octavius` package that is literally just a wrapper around tiged + setup:

```js
#!/usr/bin/env node
import { execSync } from 'child_process';
const dest = process.argv[2] || 'octavius';
execSync(`npx tiged wabecerra/octavius ${dest}`, { stdio: 'inherit' });
execSync(`node ${dest}/scripts/setup.mjs`, { stdio: 'inherit' });
```

**Pros:**
- Branded experience (`npm init octavius`)
- Extremely thin -- maybe 20 lines of code
- Delegates all real work to tiged + existing setup.mjs

**Cons:**
- Still requires npm publishing and maintenance
- Another package to version and keep alive
- Adds a dependency on tiged at runtime
- Marginal benefit over just documenting the tiged command

**Verdict:** Only worth it if you want the branded `npm init octavius` experience and are willing to maintain an npm package. For a personal project, probably not worth it.

---

### Option E: Git Clone with Enhanced Setup (Current Approach, Improved)

**How it works:** Keep `git clone` as the primary method but make setup.mjs smarter -- detect if it is a first run, offer to configure everything interactively.

**Enhancements to consider for setup.mjs:**
1. Add interactive prompts (port selection, admin username/password creation)
2. Add a `--noninteractive` flag for CI/Docker
3. Add system requirements check (Node version, disk space)
4. Add colored output with progress indicators
5. Generate a unique instance ID for telemetry opt-in

**Pros:**
- No new packages or tools needed
- Git clone preserves ability to pull updates
- setup.mjs is already well-structured and just needs expansion

**Cons:**
- Git clone carries full history (slower than tiged for large repos)
- User gets your git history, which may be confusing
- Harder to "own" the project -- they are on your branch

**Verdict:** Perfectly fine as-is for a personal project. The setup.mjs is already good. Minor enhancements would help but are not urgent.

---

## Decision Framework

| Factor | create-\* pkg | GitHub Template | tiged one-liner | Thin npm wrapper | Enhanced git clone |
|--------|:---:|:---:|:---:|:---:|:---:|
| Maintenance burden | High | None | None | Low | Low |
| Terminal UX | Great | Poor | Good | Great | Good |
| Always current code | No (drift risk) | Yes | Yes | Yes (via tiged) | Yes |
| Requires npm publish | Yes | No | No | Yes | No |
| Interactive prompts | Yes | No | No | Possible | Yes (in setup) |
| Brand recognition | High | Medium | Low | High | Low |
| Appropriate for project scale | No | Yes | Yes | Borderline | Yes |
| Setup time to build | 2-4 days | 5 minutes | 30 minutes | 2 hours | 1-2 hours |

### When each option makes sense:

- **create-\* package:** You have 1000+ users, multiple template variants, frequent onboarding of new developers, and a team to maintain it.
- **GitHub template:** You want a zero-effort supplementary option (enable it regardless).
- **tiged one-liner:** You want a clean, zero-maintenance terminal experience for a single-variant project.
- **Thin npm wrapper:** You care deeply about the branded `npm init` experience and will maintain the package.
- **Enhanced git clone:** You mainly use this yourself and want the simplest possible approach.

---

## Final Decision (2026-04-03)

We went with a **hybrid of Options C and D**: a thin `create-octavius` npm package that wraps `git clone` (not tiged) + the existing `npm run setup`. This gives us:

- Branded `npx create-octavius my-octavius` experience
- Git history preserved (enables `npm run update` for future updates)
- Zero template drift — always clones latest from GitHub
- Minimal maintenance — the npm package is ~100 lines with zero dependencies

We also built an **update script** (`npm run update` / `scripts/update.mjs`) that:
- Pulls latest from origin/main
- Reinstalls dependencies (with auto-retry for Node 24+)
- Re-runs setup non-destructively (preserves `.env.local` and `.data/`)
- Verifies the build passes
- Shows changelog of what updated

### What was built:

| Component | Path | Purpose |
|-----------|------|---------|
| `create-octavius/` | Root-level npm package | `npx create-octavius my-app` installer |
| `scripts/update.mjs` | In-repo script | `npm run update` for existing installs |
| `scripts/setup.mjs` | Enhanced | Node version gate, better-sqlite3 verify, --legacy-peer-deps fallback |
| `scripts/doctor.mjs` | Enhanced | 20+ checks including native module load test |
| `.nvmrc` | Root | Pins Node 22 for nvm users |

### Publishing the npm package:

```bash
cd create-octavius
npm login
npm publish
```

One-time publish. The package delegates all real work to git clone + setup.mjs, so it rarely needs updating. Only re-publish if the installer logic itself changes (not when Octavius features change).

### Rejected alternatives:

- **Full create-\* scaffold** (Option A) — still overkill, Octavius has one stack with no variants
- **tiged without npm package** (pure Option C) — doesn't preserve git history, so `npm run update` wouldn't work
- **GitHub template only** (Option B) — still worth enabling as supplementary (checkbox in repo settings)

---

## Additional Resources

- [tiged GitHub repo](https://github.com/tiged/tiged) -- actively maintained degit fork
- [create-vite source](https://github.com/vitejs/vite/tree/main/packages/create-vite) -- minimal example of a create-* tool (~550 lines)
- [npm init docs](https://docs.npmjs.com/cli/v10/commands/npm-init) -- how `npm init <name>` maps to `npx create-<name>`
- [GitHub template repos docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository)
- [@clack/prompts](https://github.com/natemoo-re/clack) -- if you ever do build a CLI, this is the modern choice for terminal prompts (used by create-vite)
