# Cashbook PWA TODO

## P0 (Critical)
- [ ] Add automated E2E tests for offline queue flow:
  - offline entry creation
  - refresh with queued data present
  - reconnect auto-sync
- [ ] Add conflict-safe idempotency for queued entry uploads (avoid duplicate inserts on retry edge cases).
- [ ] Add service worker update UX (new version available -> refresh prompt).

## P1 (High)
- [ ] Add integration tests for RBAC permissions:
  - editor without delete permission cannot delete
  - admin toggles propagate correctly
- [ ] Add visual regression checks for mobile breakpoints.
- [ ] Add audit log view in admin/team section.
- [ ] Add better AI onboarding prompt templates per industry for higher relevance.

## P2 (Medium)
- [ ] Add optional background sync support where browser supports it.
- [ ] Add CSV export option in addition to Excel/PDF.
- [ ] Add analytics for category suggestion acceptance/rejection.
- [ ] Improve onboarding copy localization support.

## P3 (Nice to Have)
- [ ] Add role-specific onboarding tips (admin vs editor).
- [ ] Add richer profile settings (avatar upload, language).
- [ ] Add entry edit history timeline.

## Ops / Maintenance
- [ ] Keep README + ARCHITECTURE updated for every major feature/change.
- [ ] Ensure every new migration is listed in README setup order.
- [ ] Keep `.env.example` in sync with runtime env usage.

## Done Recently
- [x] AI onboarding categories now typed (`income`/`expense`) and industry-aware.
- [x] Offline queue now retries and surfaces clear sync/offline status to user.
- [x] First-time branded welcome experience added after signup.
- [x] Account deletion request/confirmation flow added.

