import { useCallback, useEffect, useRef, useState } from "react";
import CodiconClose from "~icons/codicon/close";

export interface CreateBranchDialogProps {
  /** Title shown at top, e.g. "Create Branch from dev" */
  title: string;
  /** Default value for branch name input */
  defaultName?: string;
  /** Placeholder for the input */
  placeholder?: string;
  onClose: () => void;
  /** Return a string error message to keep the dialog open and show it */
  onConfirm: (params: {
    branchName: string;
    checkout: boolean;
    force: boolean;
  }) => Promise<string | undefined>;
}

export function CreateBranchDialog({
  title,
  defaultName = "",
  placeholder = "branch-name",
  onClose,
  onConfirm,
}: CreateBranchDialogProps) {
  const [branchName, setBranchName] = useState(defaultName);
  const [checkout, setCheckout] = useState(true);
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = branchName.trim();
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    try {
      const errMsg = await onConfirm({ branchName: trimmed, checkout, force });
      if (errMsg) setError(errMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [branchName, checkout, force, onConfirm]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "Enter" && !submitting) {
        handleSubmit();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSubmit, onClose, submitting]);

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
        aria-labelledby="create-branch-dialog-title"
      >
        <div className="app-dialog-header">
          <h2 id="create-branch-dialog-title" className="app-dialog-title">
            {title}
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
          {error && (
            <div className="app-dialog-error" role="alert">
              {error}
            </div>
          )}

          <label className="app-dialog-field" htmlFor="branch-name-input">
            <span className="app-dialog-label">Branch name</span>
            <input
              ref={inputRef}
              id="branch-name-input"
              className={`app-dialog-input${error ? " is-invalid" : ""}`}
              type="text"
              value={branchName}
              onChange={(event) => {
                setBranchName(event.target.value);
                setError(null);
              }}
              placeholder={placeholder}
              aria-invalid={Boolean(error)}
            />
          </label>

          <div className="app-dialog-options">
            <label className="app-dialog-checkbox">
              <input
                type="checkbox"
                checked={checkout}
                onChange={(event) => setCheckout(event.target.checked)}
              />
              <span>Checkout branch</span>
            </label>
            <label className="app-dialog-checkbox">
              <input
                type="checkbox"
                checked={force}
                onChange={(event) => {
                  setForce(event.target.checked);
                  setError(null);
                }}
              />
              <span>Overwrite existing branch</span>
            </label>
          </div>
        </div>

        <div className="app-dialog-actions">
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
            onClick={handleSubmit}
            disabled={!branchName.trim() || submitting}
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
