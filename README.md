# Cashbook PWA

Cashbook PWA is a mobile-first Progressive Web App for day-to-day cash tracking with workspace-based access control, realtime updates, timezone-aware entries, offline queueing, and export-ready reporting.

## Author
- Coded by **Grezello Kingsly Fernandes**

## What This App Does
- Track `Cash In` and `Cash Out` entries fast.
- Manage categories (income/expense) with duplicate protection.
- Support multi-user workspace access with admin/editor permissions.
- Allow controlled delete flow (direct delete or approval request).
- Show history with date presets and category filters.
- Export filtered statement to Excel/PDF.
- Work as a PWA with install support and service worker caching.
- Provide realtime entry alerts and optional browser notifications.

## Tech Stack
- Frontend: React 18 + TypeScript + Vite
- Backend: Supabase (Auth, Postgres, RLS, Storage, Realtime, RPC)
- Styling: Custom CSS (+ Tailwind configured in project)
- Build: `tsc` + `vite`

## Platforms and Browser Targets
- Mobile first: Android and iOS browsers
- Desktop: Chrome, Brave, Edge, Firefox, Safari
- PWA install:
  - Chrome/Edge/Brave: install prompt when available
  - iOS Safari: Add to Home Screen flow
- Notifications:
  - Browser/system notifications supported where platform allows permission + service support
  - Behavior varies by browser/OS policy

## Core Product Logic

### 1. Authentication and Profile
- Email/password sign in and sign up.
- Google OAuth sign in supported.
- New users get profile initialization via DB trigger.
- Profile setup captures name/phone/country/currency before full workspace usage.

### 2. Workspace and Membership Model
- A user can belong to one or many workspaces.
- Workspace has:
  - `name`, `industry`, `timezone`, `currency`
- App stores last active workspace in local storage and falls back to workspace with most active entries if needed.

### 3. RBAC and Permission Controls
- Roles: `admin`, `editor`
- Permission flags:
  - `can_delete_entries`
  - `can_manage_categories`
  - `can_manage_users`
  - `dashboard_scope` (`full` or `shift`)
- Admin normalization is enforced at DB trigger level.
- Team management supports:
  - grant/revoke workspace access
  - toggle admin access
  - toggle editor delete permission
  - toggle editor category management permission

### 4. Entry Lifecycle
- Entry fields include direction, amount, category, remarks, optional receipt, datetime, creator.
- Direction/category validation enforced server-side:
  - `cash_in` must use `income` category
  - `cash_out` must use `expense` category
- Soft-delete model:
  - active entries remain queryable by status
  - delete updates status to `deleted` with actor and timestamp

### 5. Delete Request Workflow
- If user cannot delete directly:
  - they create a delete request with reason
- Admin/authorized reviewer can approve/reject
- On approve:
  - linked entry is soft-deleted automatically by trigger function
- One pending delete request per entry is enforced by unique partial index

### 6. Category Management Logic
- Category type: `income` or `expense`
- Source: `system`, `ai_generated`, `manual`
- Duplicate prevention:
  - unique key per workspace + type + normalized name
- Drop behavior:
  - category cannot be dropped if entries already reference it
- UX safety:
  - manage list can be collapsed
  - two-step confirm drop flow to reduce accidental deletion

### 7. History and Reporting
- Date presets include:
  - today, yesterday, this week, last week, this month so far, this month, last month, custom
- Filter by category (grouped income/expense)
- Summary strip shows:
  - cash in, cash out, net
- Export section uses current filters for report generation:
  - Excel (`.xls` via HTML export)
  - PDF (print flow in new window)

### 8. Smart UX Behaviors
- Category ordering adapts by usage frequency and recency.
- In/out and amount colors are highlighted for faster visual scanning.
- Dashboard coach message and health indicator react to daily income/expense relationship.

### 9. Timezone Handling
- Workspace timezone drives:
  - entry date keying
  - display formatting in dashboard/history
  - quick-add default time
- Profile/team flows support timezone updates.
- Invalid timezone/date inputs are guarded with safe fallbacks.

### 10. Offline and Realtime
- Offline queue stores unsynced add-entry actions in local storage.
- Queue flushes automatically once online.
- Supabase Realtime subscriptions refresh entries and delete requests.
- In-app toast and optional notification used for entry events.

### 11. Stability Hardening
- Global React error boundary prevents blank-screen failures and offers reload.
- Defensive formatting guards for date/time parsing and timezone fallback.

## Database and Supabase Details

### Main Tables
- `profiles`
- `workspaces`
- `workspace_members`
- `categories`
- `entries`
- `delete_requests`
- `audit_logs`

### Key RPC / DB Functions Used by App
- `create_workspace_with_owner`
- `list_workspace_members`
- `add_workspace_member_by_contact`
- `can_delete_entries`
- permission helpers:
  - `is_workspace_member`
  - `is_workspace_admin`
  - `can_manage_users`
  - `can_manage_categories`

### Important Triggers
- `handle_new_user` on `auth.users`
- `normalize_member_permissions` on `workspace_members`
- `enforce_entry_rules` on `entries`
- `handle_delete_request_review` on `delete_requests`
- `set_updated_at` on core tables

### RLS
RLS is enabled on business tables and policies enforce membership/permission checks for select/insert/update/delete paths.

## Project Structure (High Level)
- `src/App.tsx`: app orchestration, workspace bootstrap, quick add, realtime, notifications
- `src/pages/`: Auth, Dashboard, History, Team, Onboarding, Profile Setup
- `src/services/`: Supabase data access per domain
- `src/lib/`: formatters, supabase client, offline queue
- `src/components/`: reusable UI blocks and layout
- `public/sw.js`: service worker
- `supabase/migrations/`: schema and function migrations

## Environment Variables
Defined in `.env.example`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_DEFAULT_CURRENCY=USD
VITE_AI_CATEGORIES_ENDPOINT=
```

## Local Setup

1. Install dependencies:
```bash
npm install
```

2. Create env file:
```bash
cp .env.example .env
```

3. Fill `.env` values.

4. Run development server:
```bash
npm run dev
```

5. Type check:
```bash
npm run check
```

6. Production build:
```bash
npm run build
```

7. Preview build:
```bash
npm run preview
```

## Supabase Setup (Required)

1. Create a Supabase project.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env`.
3. Run migrations from `supabase/migrations` in order:
   - `202602180001_init_cashbook.sql`
   - `202602180002_profile_trigger.sql`
   - `202602180003_storage_receipts.sql`
   - `202602180004_member_management.sql`
   - `202602180005_profile_metadata_sync.sql`
4. Ensure Storage bucket `receipts` exists (migration includes it).
5. Enable Google provider in Supabase Auth if Google sign-in is required.

## Branding Assets
- Main brand logo path:
  - `public/brand/cashbook-logo.png`
- Notes file:
  - `public/brand/README.txt`

## Troubleshooting

### App shows setup screen
- Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`.

### Member RPC errors (schema cache / missing function)
- Verify all migrations were applied to the same Supabase project.

### No entries visible for a different user
- Check workspace membership and selected workspace context.

### Export shows no rows
- Ensure active filters actually return rows and custom date range is complete.

### Notification issues
- Confirm browser permission is granted.
- On some mobile/browser combos, background behavior is platform-restricted.

## Security and Data Notes
- This app is client-first with Supabase RLS as primary enforcement.
- Never expose Supabase `service_role` key in frontend code.
- Anon key is expected in browser; secure access depends on RLS and policies.

## Scripts
- `npm run dev`: start local dev server
- `npm run check`: TypeScript checks
- `npm run build`: production build
- `npm run preview`: preview production build
