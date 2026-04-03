# create-octavius

Set up a new [Octavius](https://github.com/wabecerra/octavius) instance — a self-hosted Personal Life Operating System powered by AI agents.

## Usage

```bash
npx create-octavius my-octavius
```

This will:

1. Clone the Octavius repository into `my-octavius/`
2. Install all dependencies (with automatic fallback for Node 24+)
3. Verify native modules compile (`better-sqlite3`)
4. Create `.env.local` with sensible defaults
5. Create the `.data/` directory for SQLite
6. Detect and configure OpenClaw gateway (if running)
7. Validate PostCSS/Tailwind configuration

Then start the dashboard:

```bash
cd my-octavius
npm run dev
```

Open http://localhost:3000, register an account, and you're in.

## Options

```
npx create-octavius [directory]

  directory    Where to install (default: ./octavius)

  --help, -h     Show help
  --version, -v  Show version
```

## Updating

Once installed, update to the latest release with:

```bash
npm run update
```

This pulls the latest code, reinstalls dependencies, re-runs setup (your data and config are preserved), and verifies the build.

## Prerequisites

- **Node.js 22** (recommended) — `node -v` to check
- **git** — used to clone the repo (enables `npm run update` later)
- **Build tools** for native modules (`python3`, `make`, `g++`)
  - Ubuntu/Debian: `sudo apt-get install -y python3 make g++`
  - Amazon Linux: `sudo yum install -y python3 make gcc-c++`
  - macOS: `xcode-select --install`

## Troubleshooting

If anything goes wrong during or after install:

```bash
cd my-octavius
npm run doctor
```

This checks 20+ items (Node version, dependencies, native modules, config files, ports, gateway) and prints actionable fixes.

## License

MIT
