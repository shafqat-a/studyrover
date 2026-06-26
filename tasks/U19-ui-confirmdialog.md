# U19 — ConfirmDialog

- **Wave:** 2c · **Module:** ui · **Lang:** TS/React · **Depends on:** U07

## Goal
Confirmation for destructive actions + exam submit confirm (screen 3.4).

## Owns
- `frontend/src/components/ConfirmDialog.tsx`

## Reads
- `./Dialog` (U07) — composes it; does not edit Dialog.

## Steps
1. Wrap Dialog: title/message/confirm+cancel, danger variant, async confirm with loading.

## Acceptance
- [ ] Confirm/cancel callbacks; danger styling; awaits async confirm.
