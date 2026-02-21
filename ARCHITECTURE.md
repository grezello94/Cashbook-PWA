# Cashbook PWA Architecture

## 1. Purpose
This document explains the full architecture of Cashbook PWA so future development sessions can continue without losing context.

## 2. System Overview
- Client: React + TypeScript + Vite
- Backend: Supabase (Auth, Postgres, RPC, RLS, Storage, Realtime)
- Distribution: Vercel-hosted PWA
- Data resilience: offline queue + reconnect sync

## 3. Layered Design

### UI Layer
- `src/pages/*`: page-level experiences
- `src/components/*`: reusable UI (shell, cards, logo, boundaries)

### Application Layer
- `src/App.tsx`: central orchestration
  - auth bootstrap
  - profile gating
  - workspace resolution
  - tab routing state
  - quick-add modal behavior
  - realtime subscription refresh

### Domain/Service Layer
- `src/services/*`: all Supabase reads/writes and RPC calls
- Keeps data operations out of rendering components

### Shared Utilities
- `src/lib/supabase.ts`: Supabase client + config checks
- `src/lib/offlineQueue.ts`: local queue and flush operations
- `src/lib/format.ts`: date, timezone, currency helpers

### Static Domain Data
- `src/data/*`: industries, countries, default categories

## 4. Major Runtime Flows

### Auth and Boot Flow
1. Resolve auth session (`useAuthSession`).
2. If no session -> `AuthPage`.
3. If session exists -> load profile.
4. If profile incomplete -> `ProfileSetupPage`.
5. If no workspace -> invite inbox or onboarding.
6. If workspace exists -> `AppShell` with tabs.

### Workspace Selection Flow
1. Load all workspaces for user.
2. Try last workspace from local storage.
3. If unavailable, rank workspaces by active entries.
4. Load selected workspace context and data.

### Quick Add Entry Flow
1. Open cash in/out modal.
2. Auto-select default category by direction.
3. Auto-focus amount field.
4. Input uses native keyboard (`inputMode=decimal`).
5. Save online directly, or enqueue offline.

### Team Access Flow
1. User without workspace lands on `Join or Create` gate.
2. `Join Workspace` opens a waiting-room view (requests only, no workspace data/actions).
3. Admin creates access request by contact.
4. Target user sees pending request links in waiting-room view.
5. Target user accepts/rejects.
6. Membership is created only on acceptance.
7. Admin can adjust role/permissions later.

### Temporary Disable Flow
1. Admin toggles workspace access off.
2. Membership remains; `access_disabled=true`.
3. Permission helper functions exclude disabled members.
4. Admin toggles back on to restore access.
5. If migration missing, UI hides toggle and shows upgrade hint.

### Revoke Flow
1. Admin confirms permanent revoke.
2. Member row is deleted from `workspace_members`.
3. User loses workspace access immediately.

### Account Deletion Flow
1. User requests deletion link.
2. Token-based confirmation occurs on callback.
3. Preferred path uses dedicated RPC.
4. Compatibility fallback uses auth metadata token fields.

## 5. Data Model (Core)
- `profiles`
- `workspaces`
- `workspace_members`
- `categories`
- `entries`
- `delete_requests`
- `audit_logs`

## 6. Permission Model
- Roles: `admin`, `editor`
- Flags:
  - `can_delete_entries`
  - `can_manage_categories`
  - `can_manage_users`
  - `dashboard_scope`
- Effective access checks are enforced at DB level through helper functions and RLS

## 7. RPC and Service Matrix

### Membership and Access
- `list_workspace_members`
- `request_workspace_access_by_contact`
- `list_my_workspace_access_requests`
- `respond_workspace_access_request`
- `set_workspace_member_access_disabled`
- `remove_workspace_member`
- Legacy direct grant RPC exists for history only; execute is revoked from client roles in strict mode

### Account Deletion
- `request_account_deletion`
- `confirm_account_deletion`
- Metadata fallback when RPCs are missing

### Workspace
- `create_workspace_with_owner`
- context/profile/workspace queries in services

### Entries and Deletes
- entry create/list/delete service methods
- delete request create/review service methods

## 8. Realtime + Offline Strategy

### Realtime
- Subscribes to workspace-related updates
- Refreshes local workspace state on events

### Offline
- Queue stores pending entry payloads in local storage
- Flush attempts on reconnect and periodic checks
- Failed payloads remain queued

## 9. Compatibility Strategy
The app explicitly handles older DB states to prevent blank failures:
- Missing remove-member RPC -> direct delete fallback
- Missing account deletion RPC -> metadata fallback
- Missing `access_disabled` column -> temporary toggle hidden

Strict access mode:
- No client-side fallback to direct member grant
- Workspace access is obtained only by accepted request

## 10. Non-Negotiable Invariants
- Mobile-first usability must remain intact
- RLS and DB permission checks must not be bypassed
- Direct member grant bypass from client roles must remain blocked
- Direction/category consistency must be preserved
- Offline queue must not drop unsynced data silently
- Timezone-aware behavior must remain workspace-driven

## 11. Operational Architecture Notes
- PWA shell and icons are served from `public/`
- Service worker cache versioning is required when shell files change
- Vercel hosts static build output from Vite

## 12. File Ownership Map
- Core app flow: `src/App.tsx`
- Team domain: `src/pages/TeamPage.tsx`, `src/services/members.ts`
- History domain: `src/pages/HistoryPage.tsx`
- Auth domain: `src/hooks/useAuthSession.ts`, `src/pages/AuthPage.tsx`
- Deletion flow: `src/services/accountDeletion.ts`
- Shell/header: `src/components/layout/AppShell.tsx`
- DB schema evolution: `supabase/migrations/*.sql`

## 13. Migration Dependencies
Latest features require migration order from `README.md`.
Critical current dependency:
- `202602200003_member_access_controls.sql` for temporary disable (`access_disabled`).
- `202602210001_enforce_workspace_request_only_flow.sql` for strict request-only onboarding.
- `202602210002_revoke_public_execute_legacy_member_grant.sql` to revoke legacy direct-grant execute privileges.

## 14. Quality Gates
Before merge/release:
1. `npm run check`
2. `npm run build`
3. Manual smoke across:
  - auth
  - onboarding
  - quick add
  - history + export
  - team access request/accept/revoke
  - temporary disable (if migration available)

## 15. Future Website Reuse Notes
This PWA architecture can be used as base for a broader website by reusing:
- service layer contracts (`src/services/*`)
- domain model types (`src/types/domain.ts`)
- permission model and migration approach
- shell + page segmentation strategy
- deployment and release runbook
