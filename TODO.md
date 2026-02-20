# Cashbook PWA TODO and Roadmap

This roadmap is designed so future AI sessions can pick work in priority order without missing context.

## P0 - Critical (Stability and Security)
- [ ] Add E2E tests for offline queue lifecycle:
  - offline create
  - refresh while offline queue exists
  - reconnect auto-sync
  - retry behavior for failed payloads
- [ ] Add idempotency guard for queued entry replay to avoid rare duplicate inserts.
- [ ] Add CI pipeline gates for `npm run check` and `npm run build`.
- [ ] Add smoke-test script for core production flows after each deploy.

## P1 - High (Access and Team)
- [ ] Add scheduled temporary disable:
  - `disabled_until` datetime
  - `disable_reason` text
  - auto-reactivation logic
- [ ] Add member status badges in Team page:
  - active
  - temporarily disabled
  - disabled until date
- [ ] Add access request history log (accepted/rejected/cancelled) for admin audit.
- [ ] Add clearer “last active admin” warnings in UI before role/revoke actions.

## P1 - High (Auth and Account Lifecycle)
- [ ] Add dedicated account-state page for deleted/suspended users.
- [ ] Add resend cooldown and countdown for account deletion confirmation links.
- [ ] Add admin-only “reactivate archived account” path (if product policy allows).

## P1 - High (Product UX)
- [ ] Add loading skeletons for dashboard/history/team to reduce perceived flicker.
- [ ] Add optimistic UI update patterns where safe (role toggles, category add).
- [ ] Add keyboard accessibility pass for all interactive controls.

## P2 - Medium (Reporting and Data)
- [ ] Add CSV export option beside Excel/PDF.
- [ ] Add optional advanced filters:
  - amount range
  - created by member
  - remarks contains text
- [ ] Add audit log page for admin with filter by action/user/date.

## P2 - Medium (Notifications and PWA)
- [ ] Add service worker update prompt (“new version available”).
- [ ] Add better notification preferences (entry-only, delete-requests-only, all).
- [ ] Add optional background sync support where browser permits.

## P2 - Medium (Website Expansion Readiness)
- [ ] Define public website IA (information architecture) that mirrors app modules.
- [ ] Create reusable design tokens doc from `src/styles.css`.
- [ ] Extract shared branding and messaging into a content system.
- [ ] Add `docs/` folder for marketing and product content reuse.

## P3 - Nice to Have
- [ ] Add role-specific onboarding tours (admin vs editor).
- [ ] Add profile avatar upload.
- [ ] Add entry edit history timeline.
- [ ] Add localization framework for multilingual UI copy.

## Documentation Discipline
- [ ] Keep `README.md`, `ARCHITECTURE.md`, and `TODO.md` updated in the same commit as any major feature change.
- [ ] Append each new migration to README migration order immediately.
- [ ] Add release notes section per deploy tag.

## Done Recently
- [x] Access request confirmation workflow (admin request -> user accept/reject).
- [x] Invite inbox page for pending access requests.
- [x] Temporary access disable toggle with DB capability detection.
- [x] Permanent revoke confirmation UX.
- [x] Account deletion fallback flow for missing RPC migration.
- [x] Native mobile amount input + auto-focus in quick add modal.
- [x] Mobile haptic feedback while typing amount.
- [x] Removed voice button from quick entry UI.
- [x] Header/action spacing and visual cleanup.
- [x] PWA icon refresh and service worker cache bump.
