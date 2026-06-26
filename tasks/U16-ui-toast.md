# U16 — Toast / notifications

- **Wave:** 2c · **Module:** ui · **Lang:** TS/React · **Depends on:** F07

## Goal
Toast system + `useToast` hook; provider mounted by F11.

## Owns
- `frontend/src/components/Toast.tsx` (provider, container, `useToast`)

## Steps
1. Context provider + `toast.success/error/info`; auto-dismiss; `role=status`/`aria-live=polite`.

## Acceptance
- [ ] Toasts appear/auto-dismiss; SR-announced; `useToast` consumable.
