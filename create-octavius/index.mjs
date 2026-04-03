#!/usr/bin/env node

/**
 * create-octavius — one-command installer for Octavius.
 *
 * Usage:
 *   npx create-octavius my-octavius
 *   npx create-octavius .              # install in current directory
 *   npx create-octavius                # defaults to ./octavius
 */

import { execSync, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'

const REPO = 'https://github.com/wabecerra/octavius.git'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

function log(msg) { console.log(msg) }
function ok(msg) { log(`${GREEN}✓${RESET} ${msg}`) }
function fail(msg) { log(`${RED}✗${RESET} ${msg}`) }
function warn(msg) { log(`${YELLOW}!${RESET} ${msg}`) }

// ─── Parse args ───

const args = process.argv.slice(2).filter(a => !a.startsWith('-'))
const flags = process.argv.slice(2).filter(a => a.startsWith('-'))

if (flags.includes('--help') || flags.includes('-h')) {
  log(`
${BOLD}create-octavius${RESET} — set up a new Octavius instance

${BOLD}Usage:${RESET}
  npx create-octavius [directory]

${BOLD}Examples:${RESET}
  npx create-octavius my-octavius   ${DIM}# new folder${RESET}
  npx create-octavius .             ${DIM}# current (empty) folder${RESET}
  npx create-octavius               ${DIM}# defaults to ./octavius${RESET}

${BOLD}Options:${RESET}
  --help, -h     Show this help
  --version, -v  Show version
`)
  process.exit(0)
}

if (flags.includes('--version') || flags.includes('-v')) {
  const { readFileSync } = await import('node:fs')
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  log(pkg.version)
  process.exit(0)
}

const target = resolve(args[0] || 'octavius')
const dirName = basename(target)

// ─── Pre-flight checks ───

log(`\n${BOLD}  Octavius — Personal Life OS${RESET}\n`)

// Node version
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10)
if (nodeMajor < 22) {
  fail(`Node.js 22+ required (you have ${process.version})`)
  log(`  Install via: https://nodejs.org/ or nvm install 22`)
  process.exit(1)
}

// Git available
try {
  execSync('git --version', { stdio: 'ignore' })
} catch {
  fail('git is required but not found in PATH')
  process.exit(1)
}

// Target directory
if (target !== process.cwd() && existsSync(target)) {
  const contents = readdirSync(target)
  if (contents.length > 0) {
    fail(`Directory ${dirName}/ already exists and is not empty`)
    process.exit(1)
  }
}

// ─── Clone ───

log(`${DIM}Cloning into ${dirName}/...${RESET}`)
try {
  execSync(`git clone --depth 1 ${REPO} "${target}"`, { stdio: 'inherit' })
  ok('Repository cloned')
} catch {
  fail('git clone failed — check your network connection')
  process.exit(1)
}

// ─── Run setup ───

log(`\n${DIM}Running setup...${RESET}\n`)

const setup = spawn('npm', ['run', 'setup'], {
  cwd: target,
  stdio: 'inherit',
  shell: true,
})

setup.on('close', (code) => {
  if (code !== 0) {
    fail('Setup failed — check the errors above')
    log(`  You can retry manually:`)
    log(`    cd ${dirName} && npm run setup`)
    process.exit(1)
  }

  log(`\n${'─'.repeat(50)}`)
  log(`\n${GREEN}${BOLD}  Octavius is ready!${RESET}\n`)
  log(`  ${BOLD}Start the dashboard:${RESET}`)
  log(`    cd ${dirName}`)
  log(`    npm run dev\n`)
  log(`  ${BOLD}Then open:${RESET} http://localhost:3000\n`)
  log(`  ${BOLD}Update later:${RESET}`)
  log(`    npm run update\n`)
  log(`  ${BOLD}Diagnose issues:${RESET}`)
  log(`    npm run doctor\n`)
})
