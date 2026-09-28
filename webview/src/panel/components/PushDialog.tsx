import { useCallback, useEffect, useRef } from "react";
import CodiconClose from "~icons/codicon/close";

export interface PushDialogProps {
  branchName: string;
  onClose: () => void;
  onPush: (force: boolean) => void;
}

export function PushDialog({ branchName, onClose, onPush }: PushDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  return (
    <div
      ref={backdropRef}
      className="app-dialog-overlay"
      onMouseDown={handleBackdropClick}
    >
      <div
        className="app-dialog app-dialog--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-branch-dialog-title"
        aria-describedby="push-branch-dialog-description"
      >
        <div className="app-dialog-header">
          <h2 id="push-branch-dialog-title" className="app-dialog-title">
            Push Branch
          </h2>
          <button
            type="button"
            className="app-dialog-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <CodiconClose />
          </button>
        </div>

        <div className="app-dialog-body">
          <p id="push-branch-dialog-description" className="app-dialog-message">
            Push <strong>{branchName}</strong> to remote <strong>origin</strong>
            .
          </p>
          <p className="app-dialog-hint">
            Force push rewrites the remote branch and may discard remote
            commits.
          </p>
        </div>

        <div className="app-dialog-actions app-dialog-actions--split">
          <button
            type="button"
            className="commit-btn app-dialog-danger"
            onClick={() => onPush(true)}
          >
            Force Push
          </button>
          <div className="app-dialog-actions-end">
            <button
              type="button"
              className="commit-btn commit-btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="commit-btn commit-btn-primary"
              onClick={() => onPush(false)}
            >
              Push
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
