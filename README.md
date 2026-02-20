# Cashbook PWA

Cashbook PWA is a mobile-first Progressive Web App for daily cash tracking with workspace-level access control, offline safety, and export-ready reporting.

## Author
- Coded by **Grezello Kingsly Fernandes**

## Quick Start For Future AI Sessions
When starting a new AI session, tell it to read files in this order:
1. `README.md` (product scope + setup + operational runbook)
2. `ARCHITECTURE.md` (technical structure + data flow + invariants)
3. `TODO.md` (active roadmap + priority stack)

## Product Scope
This app currently supports:
- Cash in/out entry logging
- Category management with type safety (`income` and `expense`)
- Team access controls (admin/editor)
- Access request + user confirmation workflow
- Temporary member suspension (when DB migration is enabled)
- Permanent member revoke
- Account deletion confirmation workflow
- History filters and exports
- Offline queue + auto sync
- Realtime updates + optional alerts
- PWA install flow and service worker caching

## Complete Feature Inventory

### 1. Authentication
- Email/password sign in
- Email/password sign up
- Google OAuth sign in
- Existing-account guard to reduce duplicate sign-up confusion

### 2. Profile Setup
- First-run profile capture:
  - full name
  - phone
  - country
  - default currency
- Profile data is used in team display and access workflows

### 3. Workspace Onboarding
- Create workspace with:
  - name
  - industry
  - timezone
  - currency
- Owner membership is auto-created
- Industry categories are seeded
- AI category suggestions can be added during onboarding

### 4. AI Category Generation
- Generates typed categories for both income and expense
- Uses industry defaults and niche-aware enrichment
- Supports optional remote endpoint via `VITE_AI_CATEGORIES_ENDPOINT`
- Safe fallback exists if AI endpoint is unavailable

### 5. Dashboard Operations
- Cash In modal flow
- Cash Out modal flow
- Numeric amount entry via native mobile keyboard (`inputMode=decimal`)
- Auto-focus amount field when quick add opens
- Mobile haptic feedback on amount typing (supported devices)
- Optional receipt image upload
- Remarks, date, and time capture

### 6. Entry Rules and Safety
- Direction-category validation:
  - `cash_in` must use `income`
  - `cash_out` must use `expense`
- Soft-delete model for entries
- If user cannot delete directly, a delete request workflow is used

### 7. Delete Request Workflow
- Users without delete permission can request deletion
- Admin can approve/reject requests
- Approved request triggers delete workflow in DB logic

### 8. Team and Access Management
- Roles: `admin`, `editor`
- Editor permission toggles:
  - can delete entries
  - can manage categories
- Admin can promote/demote members
- Admin can revoke member access permanently
- Permanent revoke includes explicit confirmation prompt

### 9. Access Request Confirmation Flow
- Admin sends access request by email/phone
- Target user must accept/reject request
- Invite inbox page shown when user has pending requests and no active workspace
- Legacy fallback path exists for older DB schema (direct grant mode)

### 10. Temporary Access Disable
- Admin can temporarily disable workspace access (suspend) without deleting membership
- Temporarily disabled user keeps role metadata for later restore
- Toggle is hidden/disabled automatically if DB migration is not applied
- Clear UI guidance is shown when feature is unavailable

### 11. Account Deletion Flow
- User can request account deletion link
- Confirmation uses tokenized flow
- DB RPC path used when migration exists
- Metadata-based fallback works when deletion RPC/migration is missing
- Archived/deleted state can be recovered only by reactivation logic in app flow

### 12. History and Reporting
- Date presets:
  - Today
  - Yesterday
  - This Week
  - Last Week
  - This Month So Far
  - This Month
  - Last Month
  - Custom
- Category filtering (income/expense grouped)
- Totals summary strip:
  - cash in
  - cash out
  - net
- Exports:
  - Excel (`.xls`)
  - PDF (print window)

### 13. Category Controls
- Add manual categories with explicit type
- Duplicate-safe behavior (DB + service constraints)
- Drop flow with double-confirm pattern in UI
- Category controls gated by admin/editor permission

### 14. Offline-First Behavior
- Offline queue persists entry creates in local storage
- Queue key: `cashbook.offline.queue.v1`
- Auto flush on reconnect
- Retry loop while online
- Failed syncs remain queued
- User gets clear sync/offline status banners

### 15. Realtime and Notification Behavior
- Realtime subscriptions refresh workspace data
- Optional browser notifications for entry events
- In-app toast events for key actions
- Notification permission managed from app shell

### 16. PWA Behavior
- Install prompt support (where browser supports)
- iOS fallback guidance for Add to Home Screen
- Service worker shell caching
- App icons and manifest integration

### 17. UI/UX Improvements Already Applied
- Header spacing and hierarchy refined
- Team/access sections reorganized for clarity
- Voice button removed from quick entry modal
- On-screen numeric keypad removed in favor of native keyboard
- Reduced auth/session boot flicker with session dedupe logic

## Tech Stack
- Frontend: React 18 + TypeScript + Vite
- Backend: Supabase (Auth, Postgres, RLS, RPC, Storage, Realtime)
- Styling: Custom CSS (mobile-first), Tailwind tooling available
- Deployment: Vercel

## Repository Structure
- `src/App.tsx`: orchestration, bootstrap, realtime, modal, shell-level state
- `src/pages/`: screen-level flows (Auth, Dashboard, History, Team, Onboarding, Profile Setup, Invite Inbox)
- `src/services/`: Supabase operations by domain
- `src/lib/`: helpers (`supabase`, `offlineQueue`, `format`)
- `src/components/`: reusable UI and layout
- `supabase/migrations/`: schema + RPC migrations
- `public/`: manifest, icons, service worker, brand assets

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
2. Copy env file:
```bash
cp .env.example .env
```
3. Fill environment values.
4. Run dev server:
```bash
npm run dev
```
5. Validate type safety:
```bash
npm run check
```
6. Build production bundle:
```bash
npm run build
```

## Supabase Setup (Required)
Run migrations in this exact order:
1. `202602180001_init_cashbook.sql`
2. `202602180002_profile_trigger.sql`
3. `202602180003_storage_receipts.sql`
4. `202602180004_member_management.sql`
5. `202602180005_profile_metadata_sync.sql`
6. `202602200001_account_deletion_flow.sql`
7. `202602200002_workspace_access_requests.sql`
8. `202602200003_member_access_controls.sql`
9. `202602200004_fix_list_workspace_members_type_mismatch.sql`

After running migrations, refresh schema cache:
```sql
notify pgrst, 'reload schema';
```

## Known Compatibility Modes
If latest migrations are not applied, app has fallback behavior for:
- account deletion request/confirm
- workspace member revoke
- workspace access grant flow (legacy direct grant)

Temporary member suspension requires migration `202602200003_member_access_controls.sql` and `workspace_members.access_disabled` column.

## Deployment Runbook (Vercel)

### First-time setup
1. Install Vercel CLI:
```bash
npm i -g vercel
```
2. Login:
```bash
vercel login
```
3. Link project from repo root:
```bash
vercel
```

### Production deploy
```bash
vercel --prod
```

### Required Vercel environment variables
Set in Vercel Project Settings:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_DEFAULT_CURRENCY` (optional)
- `VITE_AI_CATEGORIES_ENDPOINT` (optional)

### Production URL
- `https://cashbook-pwa.vercel.app/`

## Release Checklist
Before every push/deploy:
1. `npm run check`
2. `npm run build`
3. Verify login, entry create, history filters, export, and team access actions
4. If team/permission code changed, verify related migrations are applied in target Supabase project

## Troubleshooting

### Error: missing RPC / schema cache
- Cause: migration not applied or schema cache stale
- Fix: run missing migration, then execute:
```sql
notify pgrst, 'reload schema';
```

### Temporary disable unavailable message
- Cause: `workspace_members.access_disabled` not present
- Fix: run `202602200003_member_access_controls.sql`

### Localhost refused connection
- Cause: dev server not running
- Fix:
```bash
npm run dev
```

### App stuck on boot screen repeatedly
- Check auth session loops and Supabase connectivity
- Confirm environment keys are correct

### Member not visible / wrong member data
- Verify active workspace membership rows
- Verify current user and workspace context

## Security Notes
- Do not place Supabase `service_role` key in frontend
- RLS is the primary security boundary
- UI checks improve UX; DB checks enforce policy

## Related Docs
- `ARCHITECTURE.md`
- `TODO.md`
- `supabase/migrations/`
