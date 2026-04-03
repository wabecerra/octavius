#!/usr/bin/env node

/**
 * Octavius Update Script
 *
 * Pulls latest changes and re-runs setup safely:
 * 1. Checks for uncommitted local changes (warns but doesn't block)
 * 2. Pulls latest from origin/main
 * 3. Re-installs dependencies (handles new/changed deps)
 * 4. Re-runs setup (non-destructive — won't overwrite .env.local)
 * 5. Verifies build
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts })

const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

function ok(msg) { console.log(`${GREEN}✓${RESET} ${msg}`) }
function fail(msg) { console.log(`${RED}✗${RESET} ${msg}`) }
function warn(msg) { console.log(`${YELLOW}!${RESET} ${msg}`) }

console.log(`\n${BOLD}  Octavius — Update${RESET}\n`)

// ─── Step 1: Check if this is a git repo ───

if (!existsSync(join(ROOT, '.git'))) {
  fail('Not a git repository — update requires a git clone install')
  console.log('  If you installed with npx tiged or downloaded a zip,')
  console.log('  re-install with: npx create-octavius my-octavius')
  process.exit(1)
}

// ─── Step 2: Check for local changes ───

const status = run('git status --porcelain').trim()
if (status) {
  warn('You have uncommitted local changes:')
  console.log(`${DIM}${status}${RESET}`)
  console.log()
  warn('These files will be preserved, but conflicts may occur.')
  console.log('  To stash them first: git stash')
  console.log()
}

// ─── Step 3: Record current version ───

let oldCommit
try {
  oldCommit = run('git rev-parse --short HEAD').trim()
} catch {
  oldCommit = 'unknown'
}

// ─── Step 4: Pull latest ───

console.log(`${DIM}Pulling latest changes...${RESET}`)
try {
  const pullOutput = run('git pull --rebase=false origin main 2>&1')

  if (pullOutput.includes('Already up to date')) {
    ok('Already up to date')
    console.log(`\n${GREEN}${BOLD}  No update needed — you're on the latest version.${RESET}\n`)
    process.exit(0)
  }

  ok('Pulled latest changes')
} catch (err) {
  if (err.stderr?.includes('CONFLICT') || err.stdout?.includes('CONFLICT')) {
    fail('Merge conflict detected')
    console.log('  Resolve conflicts manually, then re-run: npm run update')
    process.exit(1)
  }
  fail('git pull failed')
  console.log(`  ${err.message}`)
  process.exit(1)
}

const newCommit = run('git rev-parse --short HEAD').trim()

// ─── Step 5: Show what changed ───

console.log(`\n${DIM}Updated: ${oldCommit} → ${newCommit}${RESET}`)
try {
  const log = run(`git log --oneline ${oldCommit}..${newCommit}`).trim()
  if (log) {
    console.log(`${DIM}${log}${RESET}`)
  }
} catch {
  // Non-fatal
}

// ─── Step 6: Reinstall dependencies ───

console.log(`\n${DIM}Reinstalling dependencies...${RESET}`)
try {
  run('npm install --include=dev', { stdio: 'inherit' })
  ok('Dependencies updated')
} catch {
  console.log(`${DIM}Retrying with --legacy-peer-deps...${RESET}`)
  try {
    run('npm install --include=dev --legacy-peer-deps', { stdio: 'inherit' })
    ok('Dependencies updated (with --legacy-peer-deps)')
  } catch {
    fail('npm install failed — check errors above')
    process.exit(1)
  }
}

// ─── Step 7: Re-run setup (non-destructive) ───

console.log(`\n${DIM}Re-running setup...${RESET}\n`)
try {
  run('node scripts/setup.mjs', { stdio: 'inherit' })
} catch {
  warn('Setup had warnings — run npm run doctor to diagnose')
}

// ─── Step 8: Verify build ───

console.log(`\n${DIM}Verifying build...${RESET}`)
try {
  run('npx next build 2>&1', { timeout: 120_000 })
  ok('Build passed')
} catch {
  warn('Build has issues — run npm run doctor')
}

// ─── Done ───

console.log(`\n${'─'.repeat(50)}`)
console.log(`\n${GREEN}${BOLD}  Update complete! ${oldCommit} → ${newCommit}${RESET}\n`)
console.log(`  Start the dashboard: npm run dev`)
console.log(`  Diagnose issues:     npm run doctor\n`)
