# iCloud Notes for Windows

A small Electron desktop app that opens iCloud Notes in a dedicated Windows app window and keeps the session persistent between launches.

## Features

- Opens `https://www.icloud.com/notes` in an Electron window
- Uses a persistent browser partition so you do not need to log in every time
- Minimizes to the system tray instead of closing
- Remembers window size and position
- Includes a splash screen while loading
- Can clear the saved session and force a fresh login

## Tech Stack

- Electron
- electron-builder
- electron-store

## Requirements

- Windows
- Node.js 18+ recommended
- An Apple ID with access to iCloud Notes

## Getting Started

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

## Build

Build the Windows installer and portable app:

```bash
npm run build
```

Build only the portable version:

```bash
npm run build-portable
```

Build output is written to `dist/`.

## Project Files

- `main.js` - Electron main process and tray/session behavior
- `preload.js` - minimal preload bridge
- `splash.html` - loading splash screen
- `icon.ico` / `icon.png` - app icons

## Session Storage

This app uses Electron's persistent session storage to keep you signed in across restarts. Session data is stored on the local machine through Electron, not inside the repository source files.

If you want to sign out, use the tray menu option: `Clear Session & Re-login`.

## Notes

- This is an unofficial desktop wrapper for iCloud Notes.
- Apple may change iCloud web behavior at any time, which could affect compatibility.

## License

Add a license here before publishing publicly.
