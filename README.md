# CODE LIBRARY

Unified game launcher, library organizer, and AI-assisted mod manager for Windows.

Built with Electron + React + Tailwind CSS + SQLite (sql.js).

## Is This Safe?

**Yes.** CODE LIBRARY is fully open source — you can inspect every line of code in this repository. Here's why you can trust it:

- **100% open source** — No hidden code, no trackers, no telemetry. The entire app is in this repo.
- **No server-side code** — The app runs entirely on your machine. It only communicates with the Nexus Mods API using your own API key.
- **VirusTotal scanned** — [View the full VirusTotal scan](https://www.virustotal.com/gui/file/05effac51a87063ecca332b881ade41b486dff6776f3c7f7361e4946e189ffc3/detection). The app is clean with 0 detections.
- **No bundled malware** — The only third-party libraries used are well-known open source packages (Electron, React, sql.js, adm-zip). All listed in `package.json`.
- **Portable** — The app is a portable zip. No installer modifies your system. Just extract and run.

### Why Windows SmartScreen May Warn You

Windows SmartScreen shows a warning for apps from unrecognized publishers. This is a reputation system, not a security scan. CODE LIBRARY is safe — the warning appears simply because not enough people have downloaded it yet for Microsoft to build a trust reputation. Click **More info** → **Run anyway** to proceed.

## Features

- **Game Library** — Automatically scans Steam, GOG, Epic, and Rockstar libraries. Add custom games manually.
- **Game Launcher** — Launch games in Vanilla or Modded mode directly from the app.
- **Mod Browser** — Search and browse mods from Nexus Mods. Install with one click.
- **Dependency Resolution** — Automatically detects and installs required frameworks (BepInEx, SMAPI, Script Extender, etc.).
- **Mod Management** — Track installed mods per game, view details, and clean uninstall.
- **Welcome Guide** — First-run setup wizard with Nexus Mods API key configuration.

## Download

Go to the [Releases](https://github.com/erezsela99/code-library/releases/latest) page and download the latest zip. Extract it to any folder and run `CODE LIBRARY.exe`.

## Install from Source

```bash
git clone https://github.com/erezsela99/code-library.git
cd code-library
npm install
npm run dev
```

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
