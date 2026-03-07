# Mobile App (iOS First)

## Setup
1. Install dependencies in `mobile/`.
2. Create `mobile/.env` with:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Optional (recommended for multi-project users):

```bash
# JSON array of project profiles. Each profile maps to one company ledger.
EXPO_PUBLIC_SUPABASE_PROFILES=[{"id":"p1","label":"Company A","url":"https://aaaa1111.supabase.co","anonKey":"sb_publishable_xxx"},{"id":"p2","label":"Company B","url":"https://bbbb2222.supabase.co","anonKey":"sb_publishable_yyy"}]
```

If `EXPO_PUBLIC_SUPABASE_PROFILES` is set, mobile uses it as the initial profile list.
Users can also add project profiles in-app by entering:
- project ref (URL is auto-derived),
- publishable/anon key,
- optional label.

Added project profiles are persisted locally on-device in app document storage (`sync-project-profiles.json`).

## Run
```bash
npm install
npm run ios
```

## Web/PWA (No Apple Developer Program)
This app can be deployed as a web/PWA build and installed on iOS via Safari:

### Local Web Run
```bash
npm run web
```

### Export Static Web Build
```bash
npm run export:web
```

Output is generated in `mobile/dist`.

### Deploy to Netlify
1. Create a new Netlify site.
2. Connect the `mobile/` folder as the project root.
3. Build command: `npm run export:web`
4. Publish directory: `dist`

### Install on iOS
1. Open the deployed URL in Safari.
2. Tap Share → Add to Home Screen.

### Updates
Redeploy the site to push updates. Users get the new version on next open/refresh.

## Features (MVP)
- Login
- Transactions list
- Quick add transaction
- Ledger view
- Reports (account balances)
- Invite collaborators by email (owners only)
- Multi-project profile switcher (one profile = one company ledger)
