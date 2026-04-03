#!/usr/bin/env node

/**
 * Octavius Doctor — diagnose common setup and runtime issues.
 *
 * Usage: npm run doctor
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

let passed = 0
let warnings = 0
let errors = 0

function ok(msg) { console.log(`  ✓ ${msg}`); passed++ }
function warn(msg) { console.log(`  ⚠ ${msg}`); warnings++ }
function fail(msg) { console.log(`  ✗ ${msg}`); errors++ }

console.log('\n🩺 Octavius Doctor\n')

// --- Node.js version ---
console.log('Node.js:')
const nodeVersion = process.versions.node.split('.').map(Number)
if (nodeVersion[0] >= 22) {
  ok(`Node.js ${process.version}`)
} else if (nodeVersion[0] >= 20) {
  warn(`Node.js ${process.version} — 22+ recommended, 20 may work`)
} else {
  fail(`Node.js ${process.version} — 22+ required`)
}

// --- Package manager ---
console.log('\nDependencies:')
const nodeModules = join(ROOT, 'node_modules')
if (existsSync(nodeModules)) {
  ok('node_modules present')
} else {
  fail('node_modules missing — run: npm install')
}

const lockFile = join(ROOT, 'package-lock.json')
if (existsSync(lockFile)) {
  ok('package-lock.json present')
} else {
  warn('package-lock.json missing — run: npm install')
}

// Check for key dependencies
const criticalDeps = ['next', 'react', 'better-sqlite3', 'tailwindcss']
for (const dep of criticalDeps) {
  const depPath = join(nodeModules, dep)
  if (existsSync(depPath)) {
    ok(`${dep} installed`)
  } else {
    fail(`${dep} missing — run: npm install`)
  }
}

// Verify better-sqlite3 native module actually loads
try {
  const { createRequire } = await import('node:module')
  const require = createRequire(join(ROOT, 'package.json'))
  require('better-sqlite3')
  ok('better-sqlite3 native module loads OK')
} catch (err) {
  fail(`better-sqlite3 native module broken: ${err.message}`)
  console.log('    Fix: delete node_modules, install build tools, re-run npm install')
  if (process.platform === 'linux') {
    console.log('    Build tools: sudo apt-get install -y python3 make g++')
  } else if (process.platform === 'darwin') {
    console.log('    Build tools: xcode-select --install')
  }
}

// Check .nvmrc
const nvmrc = join(ROOT, '.nvmrc')
if (existsSync(nvmrc)) {
  const pinned = readFileSync(nvmrc, 'utf-8').trim()
  ok(`.nvmrc present (pins Node ${pinned})`)
  if (nodeVersion[0] > parseInt(pinned)) {
    warn(`Running Node ${process.version} but .nvmrc pins ${pinned} — consider: nvm use`)
  }
} else {
  warn('.nvmrc missing — add one to pin the Node version for contributors')
}

// --- Environment ---
console.log('\nEnvironment:')
const envLocal = join(ROOT, '.env.local')
if (existsSync(envLocal)) {
  ok('.env.local exists')
} else {
  warn('.env.local missing — run: npm run setup')
}

const envExample = join(ROOT, '.env.example')
if (existsSync(envExample)) {
  ok('.env.example exists')
} else {
  warn('.env.example missing from repo')
}

// --- Data directory ---
console.log('\nData:')
const dataDir = join(ROOT, '.data')
if (existsSync(dataDir)) {
  ok('.data/ directory exists')
  const dbFile = join(dataDir, 'memory.sqlite')
  if (existsSync(dbFile)) {
    ok('memory.sqlite database found')
  } else {
    ok('.data/ exists but no database yet (created on first run)')
  }
} else {
  warn('.data/ directory missing — run: npm run setup')
}

// --- PostCSS / Tailwind ---
console.log('\nCSS Pipeline:')
const postcssEsm = join(ROOT, 'postcss.config.mjs')
const postcssCjs = join(ROOT, 'postcss.config.js')
const postcssExists = existsSync(postcssEsm) || existsSync(postcssCjs)

if (postcssExists) {
  const configFile = existsSync(postcssEsm) ? postcssEsm : postcssCjs
  const configFormat = existsSync(postcssEsm) ? 'ESM (.mjs)' : 'CJS (.js)'
  const content = readFileSync(configFile, 'utf-8')

  ok(`PostCSS config found (${configFormat})`)

  if (content.includes('tailwindcss')) {
    ok('tailwindcss plugin configured')
  } else {
    fail('tailwindcss plugin missing from PostCSS config')
  }

  if (content.includes('autoprefixer')) {
    ok('autoprefixer plugin configured')
  } else {
    warn('autoprefixer not in PostCSS config (optional but recommended for production)')
  }
} else {
  fail('No PostCSS config found — Tailwind CSS will not work')
  console.log('    Fix: create postcss.config.mjs with tailwindcss plugin')
}

const tailwindConfig = join(ROOT, 'tailwind.config.ts')
const tailwindConfigJs = join(ROOT, 'tailwind.config.js')
if (existsSync(tailwindConfig) || existsSync(tailwindConfigJs)) {
  ok('Tailwind config found')
} else {
  fail('No Tailwind config found')
}

const globalsCSS = join(ROOT, 'src', 'app', 'globals.css')
if (existsSync(globalsCSS)) {
  const cssContent = readFileSync(globalsCSS, 'utf-8')
  if (cssContent.includes('@tailwind base')) {
    ok('globals.css has @tailwind directives')
  } else {
    fail('globals.css missing @tailwind directives')
  }
} else {
  fail('src/app/globals.css not found')
}

const layoutFile = join(ROOT, 'src', 'app', 'layout.tsx')
if (existsSync(layoutFile)) {
  const layoutContent = readFileSync(layoutFile, 'utf-8')
  if (layoutContent.includes("import './globals.css'") || layoutContent.includes('import "./globals.css"')) {
    ok('layout.tsx imports globals.css')
  } else {
    fail('layout.tsx does not import globals.css — styles will not load')
  }
} else {
  fail('src/app/layout.tsx not found')
}

// --- Next.js config ---
console.log('\nNext.js:')
const nextConfig = join(ROOT, 'next.config.mjs')
const nextConfigJs = join(ROOT, 'next.config.js')
if (existsSync(nextConfig) || existsSync(nextConfigJs)) {
  ok('Next.js config found')
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
  const nextVersion = pkg.dependencies?.next || pkg.devDependencies?.next || 'unknown'
  ok(`Next.js version: ${nextVersion}`)

  // Check for Turbopack issues with v15+
  const versionMatch = nextVersion.match(/(\d+)/)
  if (versionMatch && parseInt(versionMatch[1]) >= 15) {
    const configContent = readFileSync(existsSync(nextConfig) ? nextConfig : nextConfigJs, 'utf-8')
    if (!configContent.includes('turbopack')) {
      warn('Next.js 15+ detected but no turbopack config — add turbopack: {} to next.config')
    }
  }
} else {
  fail('No Next.js config found')
}

// --- Port check ---
console.log('\nNetwork:')
try {
  const net = await import('node:net')
  const portFree = await new Promise((resolve) => {
    const server = net.default.createServer()
    server.once('error', (err) => resolve(err.code !== 'EADDRINUSE'))
    server.once('listening', () => { server.close(); resolve(true) })
    server.listen(3000, '0.0.0.0')
  })
  if (portFree) {
    ok('Port 3000 is available')
  } else {
    warn('Port 3000 is in use — kill the process or use: npm run dev -- -p 3001')
  }
} catch {
  warn('Could not check port 3000')
}

// --- OpenClaw gateway ---
console.log('\nOpenClaw Gateway:')
try {
  const net = await import('node:net')
  const gatewayUp = await new Promise((resolve) => {
    const socket = new net.default.Socket()
    socket.setTimeout(2000)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
    socket.on('error', () => resolve(false))
    socket.connect(18789, 'localhost')
  })
  if (gatewayUp) {
    ok('Gateway responding on localhost:18789')
  } else {
    ok('No gateway detected (optional — agents work without it)')
  }
} catch {
  ok('Gateway check skipped')
}

// --- Summary ---
console.log('\n' + '─'.repeat(50))
console.log(`\n  ${passed} passed, ${warnings} warnings, ${errors} errors\n`)

if (errors > 0) {
  console.log('  Fix the errors above, then run: npm run doctor')
  process.exit(1)
} else if (warnings > 0) {
  console.log('  Everything should work, but check the warnings above.')
} else {
  console.log('  All clear! Run: npm run dev')
}
console.log()
