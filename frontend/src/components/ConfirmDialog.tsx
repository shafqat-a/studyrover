import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Dialog } from './Dialog';
import type { DialogSize } from './Dialog';
import { Button } from './Button';

/**
 * U19 — ConfirmDialog
 *
 * A presentational confirmation dialog for destructive actions and the exam
 * submit confirmation (screen 3.4). Composes the U07 `Dialog` and U01 `Button`
 * primitives; it never re-implements modal/focus behaviour.
 *
 * Behaviour:
 * - `onConfirm` may be synchronous or return a Promise. While a returned
 *   Promise is pending the confirm button shows a loading spinner, the cancel
 *   button is disabled, and backdrop/ESC closing is suppressed so the action
 *   cannot be interrupted.
 * - `onCancel` is invoked for cancel/ESC/backdrop/close interactions.
 * - `danger` switches the confirm button to the destructive style.
 *
 * Props-driven only: no data fetching, no business logic. Styling uses the
 * StudyRover design tokens via the composed primitives.
 */

export interface ConfirmDialogProps {
  /** Whether the dialog is visible. Controlled. */
  open: boolean;
  /** Title rendered in the header and used as the accessible name. */
  title: ReactNode;
  /** Body message describing the consequence of confirming. */
  message?: ReactNode;
  /** Label for the confirm button. Defaults to `Confirm`. */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to `Cancel`. */
  cancelLabel?: string;
  /** Use the destructive confirm styling. Defaults to false. */
  danger?: boolean;
  /**
   * Invoked when the user confirms. May return a Promise; the confirm button
   * shows a loading state until it resolves.
   */
  onConfirm: () => void | Promise<void>;
  /** Invoked when the user cancels / dismisses the dialog. */
  onCancel: () => void;
  /** Width of the dialog panel. Defaults to `sm`. */
  size?: DialogSize;
  /** Optional extra content rendered below the message. */
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
  size = 'sm',
  children,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (loading) return;
    try {
      setLoading(true);
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }, [loading, onConfirm]);

  const handleCancel = useCallback(() => {
    if (loading) return;
    onCancel();
  }, [loading, onCancel]);

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      title={title}
      size={size}
      disableBackdropClose={loading}
      disableEscapeClose={loading}
      hideCloseButton={loading}
      closeLabel={cancelLabel}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={handleCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message != null && (
        <p className="text-sm text-foreground-muted">{message}</p>
      )}
      {children}
    </Dialog>
  );
}
