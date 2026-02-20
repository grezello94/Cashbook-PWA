# Cashbook PWA Architecture

## Purpose
This document explains how the app is structured, why major decisions were made, and what must be preserved when extending the system.

## High-Level Architecture
- Frontend: React + TypeScript + Vite (`src/`)
- Backend: Supabase (Auth, Postgres, Storage, Realtime, RPC)
- Data safety: local offline queue + reconnect auto-sync
- Deployment: Vercel (PWA web distribution)

## Runtime Layers
- `src/pages/`: screen-level UI and interactions
- `src/components/`: reusable UI building blocks and shell
- `src/services/`: all Supabase data access and domain operations
- `src/lib/`: shared utilities (`supabase`, formatting, offline queue)
- `src/data/`: static domain defaults (industries, default categories, country helpers)

## Core Data Flow
1. User authenticates (email/password or Google OAuth).
2. Session boots in `App.tsx`.
3. Profile completeness is checked.
4. Workspace context is resolved.
5. Categories, entries, and member directory are loaded.
6. UI tabs (Dashboard / History / Team) consume shared app state.

## Key Decisions

### 1) Single App Orchestrator (`App.tsx`)
- Decision: keep session/workspace bootstrapping in one coordinator.
- Why: avoids duplicated state/race conditions across pages.

### 2) Service-Oriented Data Access
- Decision: pages call service functions; services own Supabase queries.
- Why: keeps UI components thin and makes logic testable/traceable.

### 3) DB-Enforced Permissions + UI Guards
- Decision: permission checks exist in both UI and DB policies/RPC.
- Why: frontend checks improve UX, DB checks enforce security.

### 4) Offline-First for Entry Creation
- Decision: enqueue writes in local storage when offline.
- Why: protects against connectivity drops during cash entry.
- Sync behavior:
  - flush on reconnect
  - periodic retry while online
  - failed items remain queued

### 5) Timezone as Workspace Source of Truth
- Decision: workspace timezone drives entry time defaults and rendering.
- Why: keeps business-day reporting consistent across members/devices.

### 6) Category Direction Integrity
- Decision: category type must align with entry direction.
- Why: prevents accounting ambiguity and bad totals.

### 7) AI Onboarding Categories
- Decision: AI category generation is typed (`income` + `expense`) and industry-aware.
- Why: onboarding quality is core product differentiator.
- Fallback behavior:
  - deterministic industry templates
  - niche keyword boosters
  - optional external endpoint when configured

## Security Model
- Supabase `anon` key is used client-side by design.
- Security relies on RLS + RPC permission functions.
- Never expose `service_role` in frontend.
- Account deletion is confirmation-link based and archives access state.

## Realtime Model
- Supabase Realtime listens to `entries` and `delete_requests`.
- On updates, workspace data is refreshed.
- Browser notifications are optional and permission-gated.

## Deployment Model
- Production host: Vercel.
- Required env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - optional: `VITE_DEFAULT_CURRENCY`, `VITE_AI_CATEGORIES_ENDPOINT`

## Non-Negotiable Invariants
- Do not break RLS assumptions.
- Do not remove offline queue persistence.
- Do not bypass role checks for admin/editor actions.
- Do not change time handling to local-only naive strings.
- Keep app usable on mobile first.

## Known Tradeoffs
- Local storage queue is strong for normal offline usage, but can be lost if browser storage is manually cleared by user/device policy.
- External AI endpoint quality depends on provider response schema and uptime.

## Validation Before Merge/Deploy
- `npm run check`
- `npm run build`
- Manual smoke:
  - login
  - create entry
  - offline entry + reconnect sync
  - RBAC toggle behavior
  - export flow

