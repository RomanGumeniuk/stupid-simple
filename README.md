# 🍬 Stupid Simple

A stupidly simple, candy-colored desktop calendar for Windows with **two-way
Google Calendar sync**, a birthday module that reminds you a week ahead, time
blocking, and desktop notifications. Jelly-bean events, springy animations,
bubblegum/mango/mint/berry palette.

Built with Tauri 2 + React + TypeScript — the whole app is a few small files.

## Features

- 🔄 **Two-way Google Calendar sync** — anything you add/change/delete in
  Stupid Simple lands in Google instantly; changes from Google (your phone,
  the browser) come back automatically every minute
- 🎂 **Birthdays** — type a name + day and month; you get a yearly event with
  a reminder **7 days ahead** and on the day itself; the sidebar counts down
  to upcoming birthdays
- 🧱 **Time blocking** — drag across the hour grid in day/week view to block
  time; drag across days in month view to create multi-day events
- 🔔 **Desktop notifications** — 10 minutes before and at event start, plus a
  separate one when someone has a birthday today
- 📅 Day / week / month views, a "now" line, candy colors, event editing and
  deleting, optimistic saves with rollback on error

## Install (the easy way)

1. Go to **[Releases](../../releases)** and download the latest `.msi`
   (or `-setup.exe`) installer.
2. Run it. That's the whole install.
3. On first launch the app asks for your Google API keys — a one-time,
   ~5 minute setup. Follow the guide below.

> Why do I need my own keys? Stupid Simple talks directly to *your* Google
> account with no server in between, so you bring your own (free) OAuth
> client. Your data never touches anyone else's machine.

## Google setup (one-time, ~5 minutes)

1. Open <https://console.cloud.google.com> and create a new project
   (call it anything, e.g. "Stupid Simple").
2. **APIs & Services → Library** → search for **Google Calendar API**
   → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - Fill in the app name and your e-mail, skip the rest → Save
   - Under **Test users** add your own Gmail address (important — without
     this Google blocks sign-in with "app has not been verified")
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app** ⚠️ *(not "Web application" — see
     [troubleshooting](#error-400-redirect_uri_mismatch) below)*
   - Any name → Create
   - Copy the **Client ID** and **Client Secret**
5. Paste both into the app on the first-launch screen → **Save keys** →
   **Connect Google Calendar** → your browser opens → sign in and approve.
   Done — the keys are remembered.

## Troubleshooting

### Error 400: redirect_uri_mismatch

Google shows this in the browser when your OAuth client was created as
**"Web application"** instead of **"Desktop app"**. Desktop apps sign in via
`http://127.0.0.1:<random port>`, which Google only permits for Desktop-app
clients.

**Fix:** in [Google Cloud Console](https://console.cloud.google.com) go to
**APIs & Services → Credentials → Create Credentials → OAuth client ID**,
pick **Application type: Desktop app**, then paste the new Client ID and
Secret into the app (login screen → *Use different API keys*). You can delete
the old Web client.

### "App has not been verified" / access blocked

Add your Gmail address under **OAuth consent screen → Test users**. Test apps
can only be used by listed test users.

### Sign-in never finishes

The browser tab must end on a "Signed in!" page. If your firewall prompts
about the app listening on `127.0.0.1`, allow it — that's the one-shot local
listener Google redirects back to.

## Build from source

Prerequisites (Windows): [Node.js 20+](https://nodejs.org),
[Rust](https://rustup.rs), [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
(check "Desktop development with C++"), and WebView2 (usually already on
Windows 10/11). Full checklist: <https://tauri.app/start/prerequisites/>

```bash
git clone https://github.com/RomanGumeniuk/stupid-simple.git
cd stupid-simple
npm install
npm run tauri dev     # development mode (first Rust compile takes a few minutes)
npm run tauri build   # installer ends up in src-tauri/target/release/bundle/
```

Optionally copy `.env.example` to `.env` and fill in your keys to bake them
into your own build — then the app skips the key screen entirely. Don't
commit `.env` (it's already in `.gitignore`).

### Releasing

Push a tag like `v1.0.1` (or run the **Release** workflow manually) and
GitHub Actions builds the Windows installer and attaches it to a GitHub
Release automatically.

## Architecture (for the curious)

```
src/                   ← frontend (React + TS)
  lib/google.ts        ← OAuth + Google Calendar API v3 client
  lib/store.ts         ← Zustand: state + sync engine
  lib/notify.ts        ← notifications + date helpers
  components/          ← Sidebar, MonthView, WeekView, modals
src-tauri/
  src/lib.rs           ← the only Rust: OAuth loopback listener (pure std)
```

- **OAuth**: the standard desktop loopback flow — Rust binds a random port on
  127.0.0.1, the app opens the system browser, Google redirects back to
  localhost with a code, and the code is exchanged for tokens. Exactly what
  VS Code and Spotify do. (Google's Device Flow is *not* an option here — it
  doesn't allow the Calendar scope.)
- **Sync**: mutations (create/patch/delete) hit the API immediately
  (optimistic UI with rollback); remote changes are pulled by polling every
  60 s and after every mutation.
- **Birthdays**: plain Google events with `RRULE:FREQ=YEARLY` +
  `reminders.overrides` (10080 min = 7 days) + a marker in
  `extendedProperties.private`, so they also show up in regular Google
  Calendar on your phone.

## Known limitations (v1)

- Only the primary calendar is synced — multi-calendar support would be a
  good v1.1
- Editing a single occurrence of a recurring event changes that occurrence
  (that's how the API returns them with `singleEvents=true`)
- Tokens live in the app window's localStorage — fine for personal use; v2
  could move them to the system keychain

## License

[MIT](LICENSE)
