<p align="center">
  <img src="docs/assets/strata-logo.svg" alt="Strata" width="80" />
</p>

<h1 align="center">Strata</h1>

<p align="center">
  <strong>A 3D topographic dashboard for your Claude Code sessions.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#tech-stack">Tech Stack</a> &bull;
  <a href="#keyboard-shortcuts">Shortcuts</a>
</p>

<br/>

<p align="center">
  <img src="docs/assets/screenshot-terrain.png" alt="Strata terrain view" width="800" />
</p>

---

## What is Strata?

Strata scans your local `~/.claude/` directory and visualizes every Claude Code session you've ever run as an interactive **3D topographic terrain map**. Peaks represent token usage — the bigger the session, the taller the mountain.

No cloud. No accounts. Everything runs locally on your machine.

---

## Features

### Tactical Terrain Map
A full 3D heightfield with Gaussian-smoothed peaks, contour lines, and a military-inspired color ramp (navy &rarr; teal &rarr; green &rarr; amber &rarr; gold). Navigate like Google Maps — drag to pan, scroll to zoom, right-drag to tilt.

### Session Browser
Every session across all your projects, grouped and searchable. Click any session to fly the camera to its terrain peak and see full details — prompts, token breakdown, tool usage, and a one-click resume button.

### Live Updates
File watcher monitors `~/.claude/projects/` in real-time via WebSocket. Start a Claude Code session in another terminal and watch the terrain grow.

### Activity Timeline
Stacked area chart showing token usage over time, broken down by project. See your usage patterns at a glance.

### Project Breakdown
Horizontal bar chart ranking all projects by total token consumption.

### Command Palette
`Cmd+K` to search across sessions, projects, and actions. Find anything instantly.

### Resume Sessions
Click "Resume" on any session to launch `claude --resume <id>` in a new Terminal window and pick up where you left off.

---

## Quick Start

```bash
# Clone
git clone https://github.com/light-handle/strata.git
cd strata

# Install
npm install

# Run
npm run dev
```

Open **http://localhost:5173** in your browser. The server scans your Claude Code sessions automatically.

> Requires Node.js 18+ and an existing `~/.claude/` directory (created by Claude Code).

---

## How It Works

```
~/.claude/projects/
  -Users-You-project-a/
    session-uuid-1.jsonl     <- full conversation log
    session-uuid-2.jsonl
    session-uuid-2/subagents/agent-xyz.jsonl
  -Users-You-project-b/
    ...
```

Claude Code stores every session as a `.jsonl` file — one JSON object per line containing messages, tool calls, token usage, and metadata. Strata:

1. **Scans** all project directories and parses every session file
2. **Extracts** token counts, prompts, tool usage, timestamps, models
3. **Maps** sessions onto a 2D grid (time x project) with Gaussian smoothing
4. **Renders** a 3D heightfield terrain with contour lines
5. **Watches** for file changes and pushes live updates via WebSocket

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| 3D Engine | Three.js + React Three Fiber + Drei |
| Charts | D3.js |
| Styling | Tailwind CSS 4 |
| Backend | Express + WebSocket (ws) |
| File Watching | Chokidar |
| Font | JetBrains Mono |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `[` | Toggle sessions panel |
| `]` | Toggle detail panel |
| `` ` `` | Toggle analytics tray |
| `Cmd+K` | Command palette |
| `Esc` | Close active panel |
| `Shift+Space` | Reset camera to overview |
| Left drag | Pan terrain |
| Scroll | Zoom in/out |
| Right drag | Tilt/rotate view |

---

## Project Structure

```
strata/
  server/
    index.ts          Express + WebSocket server
    scanner.ts        JSONL parser, session aggregator
  shared/
    types.ts          Shared TypeScript types
  src/
    App.tsx           Main layout
    components/
      terrain/        3D terrain (mesh, camera, markers)
      panels/         Session list, detail, analytics
      charts/         D3 activity timeline, project bars
      CommandPalette  Cmd+K search
      HUDBar          Top status bar
    context/          App state management
    hooks/            WebSocket, keyboard
    lib/              Terrain math, formatters
```

---

## Configuration

| Environment | Default | Description |
|------------|---------|-------------|
| Server port | `3141` | Express + WebSocket |
| Client port | `5173` | Vite dev server |
| Claude dir | `~/.claude/projects/` | Auto-detected |

---

## License

MIT

---

<p align="center">
  Built with Claude Code.
</p>
