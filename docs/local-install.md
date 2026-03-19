# Local Install

## Goal

Run DuckerChat locally from a fresh clone and get:

- the local HTTP runtime
- the Electron desktop shell
- the current multi-room interface
- the auto-generated large `Ultimate Prediction` society

## Prerequisites

- `Node.js` 20+ recommended
- `npm`
- Linux, macOS, or Windows with Electron support

## 1. Clone

```bash
git clone git@github.com:ZHOU-henry/Duckerchat.git
cd Duckerchat
```

## 2. Install dependencies

```bash
npm install
```

## 3. Run the desktop app

```bash
npm run desktop
```

What happens on first desktop launch:

- the app checks whether the large `swarm-*` prediction population exists
- if missing, it auto-generates the current local society
- then it starts the local server and opens the Electron shell

## 4. Run in browser mode

```bash
npm run dev
```

Then open:

- `http://127.0.0.1:4318/`

If you want the full `Ultimate Prediction` society before browser mode:

```bash
npm run seed:swarm -- 1000 swarm-room
```

## 5. Linux note

If Electron shows a `chrome-sandbox` warning, DuckerChat falls back to
`--no-sandbox`.

That warning does not by itself mean DuckerChat failed to start.

## 6. Current module set

- `Social Rooms`
- `Question Forge`
- `Ultimate Prediction`

## 7. Current scale defaults

- `Ultimate Prediction population`
  - `1000` agents
- `concurrent model runs`
  - `20`
- `frontline / participant set`
  - `20`

## 8. Recommended first test

1. open `Ultimate Prediction`
2. ask a fresh question
3. observe the room move into `frontline_preview`
4. rotate and zoom the graph
5. click a node to inspect related agents and highlighted edges
