# Cashbook PWA

A futuristic, offline-capable cashbook Progressive Web App with Supabase RBAC.

## Tech
- React + TypeScript + Vite
- Supabase Auth + Postgres + RLS
- Custom service worker for offline shell caching

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create env file:
   ```bash
   copy .env.example .env
   ```
3. Fill Supabase variables in `.env`.
4. Run dev server:
   ```bash
   npm run dev
   ```

## Supabase
- Run the SQL migration in Supabase SQL editor.
- App expects tables: `workspaces`, `workspace_members`, `categories`, `entries`, `delete_requests`, `profiles`, `audit_logs`.

## PWA
- Manifest: `public/manifest.webmanifest`
- Service worker: `public/sw.js`

## Notes
- If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing, the app shows a setup warning screen.
