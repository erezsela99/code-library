# CODE LIBRARY

Unified game launcher, library organizer, and AI-assisted mod manager for Windows.

Built with Electron + React + Tailwind CSS + SQLite (sql.js).

## Features

- **Game Library** — Automatically scans Steam, GOG, Epic, and Rockstar libraries. Add custom games manually.
- **Game Launcher** — Launch games in Vanilla or Modded mode directly from the app.
- **Mod Browser** — Search and browse mods from Nexus Mods. Install with one click.
- **Dependency Resolution** — Automatically detects and installs required frameworks (BepInEx, SMAPI, Script Extender, etc.).
- **Mod Management** — Track installed mods per game, view details, and clean uninstall.
- **Welcome Guide** — First-run setup wizard with Nexus Mods API key configuration.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- Windows (current build target)

## Install

```bash
git clone https://github.com/erezsela99/code-library.git
cd code-library
npm install
```

## Development

```bash
npm run dev
```

This starts Vite dev server and Electron simultaneously with hot reload.

## Build

```bash
npx vite build
```

The built app runs from the `dist/` folder.

## Usage

1. Launch the app — it will scan for installed games automatically.
2. Go to **Settings** and enter your [Nexus Mods API key](https://www.nexusmods.com/users/myaccount?tab=api+access).
3. Browse the **Mod Browser** to search and install mods.
4. Click any game in your library to see its details and installed mods.
5. Launch games in **Vanilla** or **Modded** mode.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron |
| Frontend | React, React Router, Tailwind CSS |
| Database | SQLite via sql.js |
| Mod API | Nexus Mods REST API v1 |
| Build | Vite |

## License

MIT
