import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bridge, bridgeWithProgress } from "../../shared/bridge";
import { usePanelStore } from "../../shared/store/panel-store";
import type { Commit } from "../../shared/types/git";

// IntelliJ-style icons for commit context menu
function IconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="2.5"
        y="3.5"
        width="9"
        height="10"
        rx="1.5"
        stroke="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 2h.6C12.37 2 13 2.63 13 3.4v.51c0 .03 0 .06 0 .09v7.55c.6-.44 1-1.15 1-1.95V3.4C14 2.07 12.93 1 11.6 1H6.4c-.8 0-1.51.39-1.95 1H6.4H11z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconCherryPick() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="11.5" r="2.5" stroke="currentColor" />
      <circle cx="10.5" cy="10.5" r="2.5" stroke="currentColor" />
      <path
        d="M5 9C5 6 4 4 7 2"
        stroke="currentColor"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M10.5 8C10.5 5.5 11 4 8 2"
        stroke="currentColor"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function IconRevert() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.85 1.85a.5.5 0 00-.7-.7L1.65 4.65 1.3 5l.35.35 3.5 3.5a.5.5 0 00.7-.7L3.21 5.5H10.5a3.5 3.5 0 010 7H5.5a.5.5 0 000 1h5a4.5 4.5 0 000-9H3.21l2.64-2.65z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconDrop() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 4.5h8M6 4.5V3.25C6 2.56 6.56 2 7.25 2h1.5C9.44 2 10 2.56 10 3.25V4.5M5 6.5v6.25c0 .69.56 1.25 1.25 1.25h3.5c.69 0 1.25-.56 1.25-1.25V6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 8v3M9 8v3" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function IconBranch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="4.5" cy="4" r="2" stroke="currentColor" />
      <path
        d="M4.5 11.5H8.5C9.6 11.5 10.5 10.6 10.5 9.5V8"
        stroke="currentColor"
      />
      <path d="M4.5 6.5V14.5" stroke="currentColor" strokeLinecap="round" />
      <circle cx="10.5" cy="6" r="2" stroke="currentColor" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2.5h4.5l6 6-4.5 4.5-6-6V2.5z" stroke="currentColor" />
      <circle cx="5.5" cy="5" r="1" fill="currentColor" />
    </svg>
  );
}

interface CommitContextMenuProps {
  x: number;
  y: number;
  commit: Commit;
  onClose: () => void;
  onCreateBranch?: (hash: string, defaultName: string) => void;
}

export function CommitContextMenu({
  x,
  y,
  commit,
  onClose,
  onCreateBranch,
}: CommitContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const currentBranch = usePanelStore((s) => s.currentBranch);
  const allCommits = usePanelStore((s) => s.commits);
  const selectedCommitHashes = usePanelStore((s) => s.selectedCommitHashes);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [isRebasing, setIsRebasing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isCherryPicking, setIsCherryPicking] = useState(false);
  const [squashDialogOpen, setSquashDialogOpen] = useState(false);
  const [squashMessage, setSquashMessage] = useState("");
  const [squashError, setSquashError] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState("");

  const selectedCommits = useMemo(() => {
    const hashes = selectedCommitHashes.includes(commit.hash)
      ? selectedCommitHashes
      : [commit.hash];
    const selected = new Set(hashes);
    return allCommits.filter((candidate) => selected.has(candidate.hash));
  }, [allCommits, selectedCommitHashes, commit.hash]);

  const squashOrder = useMemo(
    () => [...selectedCommits].reverse(),
    [selectedCommits],
  );

  // Query rebase/merge/cherry-pick state to determine if Drop Commit should be disabled
  useEffect(() => {
    const fetchRepoState = async () => {
      try {
        const [rebaseState, mergeState, cherryPickState] = await Promise.all([
          bridge.request("getRebaseState") as Promise<{ isRebasing: boolean }>,
          bridge.request("getMergeState") as Promise<{ isMerging: boolean }>,
          bridge.request("getCherryPickState") as Promise<{
            isCherryPicking: boolean;
          }>,
        ]);
        setIsRebasing(rebaseState?.isRebasing ?? false);
        setIsMerging(mergeState?.isMerging ?? false);
        setIsCherryPicking(cherryPickState?.isCherryPicking ?? false);
      } catch {
        // If we can't determine state, leave as not disabled
      }
    };
    fetchRepoState();
  }, []);

  // Adjust position after first render
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;

      let top = y;
      let left = x;

      if (top + rect.height > viewportH) {
        const above = y - rect.height;
        if (above >= 4) {
          top = above;
        } else {
          top = Math.max(4, viewportH - rect.height - 4);
        }
      }
      if (left + rect.width > viewportW) {
        left = Math.max(4, viewportW - rect.width - 4);
      }

      setPosition({ top, left });
    });
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleBlur = () => onClose();
    const handleScroll = (e: Event) => {
      if (
        menuRef.current &&
        e.target instanceof Node &&
        !menuRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleBlur);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleBlur);
    };
  }, [onClose]);

  const shortHash = commit.shortHash || commit.hash.slice(0, 8);

  const handleCopyHash = async () => {
    onClose();
    try {
      await bridge.request("copyToClipboard", { text: commit.hash });
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleCherryPick = async () => {
    onClose();
    try {
      await bridgeWithProgress("cherryPick", { hash: commit.hash });
    } catch (err) {
      console.error("Cherry-pick failed:", err);
    }
  };

  const handleCheckoutRevision = async () => {
    onClose();
    try {
      await bridgeWithProgress("checkoutCommit", { hash: commit.hash });
    } catch (err) {
      console.error("Checkout revision failed:", err);
    }
  };

  const handleResetHard = async () => {
    onClose();
    const result = (await bridge.request("showConfirmMessage", {
      message: `Reset '${currentBranch}' to ${shortHash} (hard)? This will discard all uncommitted changes.`,
      confirmLabel: "Reset",
    })) as { confirmed: boolean };
    if (!result.confirmed) return;
    try {
      await bridgeWithProgress("resetToCommit", {
        hash: commit.hash,
        mode: "hard",
      });
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  const handleResetMixed = async () => {
    onClose();
    try {
      await bridgeWithProgress("resetToCommit", {
        hash: commit.hash,
        mode: "mixed",
      });
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  const handleResetSoft = async () => {
    onClose();
    try {
      await bridgeWithProgress("resetToCommit", {
        hash: commit.hash,
        mode: "soft",
      });
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  const handleRevert = async () => {
    onClose();
    try {
      await bridgeWithProgress("revertCommit", { hash: commit.hash });
    } catch (err) {
      console.error("Revert failed:", err);
    }
  };

  const handleEditCommitMessage = () => {
    setEditMessage([commit.subject, commit.body].filter(Boolean).join("\n\n"));
    setEditError("");
    setEditDialogOpen(true);
  };

  const handleConfirmEditCommitMessage = async () => {
    const message = editMessage.trim();
    if (!message) {
      setEditError("Commit message cannot be empty");
      return;
    }
    try {
      await bridgeWithProgress("editCommitMessage", {
        hash: commit.hash,
        message,
      });
      setEditDialogOpen(false);
      onClose();
    } catch (err) {
      console.error("Edit commit message failed:", err);
      setEditError(
        err instanceof Error ? err.message : "Failed to edit commit message",
      );
    }
  };

  const handleCancelEditCommitMessage = () => {
    setEditDialogOpen(false);
    onClose();
  };

  const handleSquash = async () => {
    const defaultMessage = squashOrder
      .map((candidate) =>
        [candidate.subject, candidate.body].filter(Boolean).join("\n"),
      )
      .join("\n\n");
    setSquashMessage(defaultMessage);
    setSquashError("");
    setSquashDialogOpen(true);
  };

  const handleConfirmSquash = async () => {
    const message = squashMessage.trim();
    if (!message) {
      setSquashError("Commit message cannot be empty");
      return;
    }
    try {
      await bridgeWithProgress("squashCommit", {
        hashes: squashOrder.map((candidate) => candidate.hash),
        message,
      });
      setSquashDialogOpen(false);
      onClose();
    } catch (err) {
      console.error("Squash commit failed:", err);
      setSquashError(
        err instanceof Error ? err.message : "Squash commits failed",
      );
    }
  };

  const handleCancelSquash = () => {
    setSquashDialogOpen(false);
    onClose();
  };

  const handleDropCommit = async () => {
    onClose();
    try {
      const result = (await bridge.request("showConfirmMessage", {
        message: `Drop commit ${shortHash} "${commit.subject}"?\n\nThis will remove the commit from history but keep its changes as unstaged modifications.\n\nThis operation cannot be undone.`,
        confirmLabel: "Drop Commit",
      })) as { confirmed: boolean };
      if (!result.confirmed) return;
      await bridgeWithProgress("dropCommit", { hash: commit.hash });
    } catch (err) {
      console.error("Drop commit failed:", err);
    }
  };

  const handleNewBranch = async () => {
    onClose();
    if (onCreateBranch) {
      onCreateBranch(commit.hash, "");
      return;
    }
    // Fallback to showInputBox if no dialog handler provided
    const result = (await bridge.request("showInputBox", {
      prompt: `Create new branch from ${shortHash}:`,
      placeHolder: "branch-name",
    })) as { value: string | null };
    if (!result.value || !result.value.trim()) return;
    try {
      await bridge.request("createBranchFromCommit", {
        branchName: result.value.trim(),
        hash: commit.hash,
      });
    } catch (err) {
      console.error("Create branch failed:", err);
    }
  };

  const handleNewTag = async () => {
    onClose();
    const result = (await bridge.request("showInputBox", {
      prompt: `Create tag at ${shortHash}:`,
      placeHolder: "tag-name",
    })) as { value: string | null };
    if (!result.value || !result.value.trim()) return;
    try {
      await bridge.request("createTag", {
        tagName: result.value.trim(),
        hash: commit.hash,
      });
    } catch (err) {
      console.error("Create tag failed:", err);
    }
  };

  const filter = usePanelStore((s) => s.filter);
  const selectCommit = usePanelStore((s) => s.selectCommit);

  const handleShowInGitLog = () => {
    onClose();
    // Clear file filter and select this commit in the full log
    usePanelStore.getState().setFilter({ file: "" });
    // After refresh, select this commit
    setTimeout(() => {
      selectCommit(commit.hash);
    }, 500);
  };

  // Drop Commit is disabled when in detached HEAD, rebasing, merging, or cherry-picking
  const isDropCommitDisabled =
    !currentBranch || isRebasing || isMerging || isCherryPicking;
  const isSquashCommitDisabled =
    isDropCommitDisabled ||
    squashOrder.length === 0 ||
    squashOrder.some((candidate) => candidate.parents.length !== 1) ||
    squashOrder.some(
      (candidate, index) =>
        index > 0 && candidate.parents[0] !== squashOrder[index - 1].hash,
    );
  const isEditCommitMessageDisabled =
    !currentBranch ||
    isRebasing ||
    isMerging ||
    isCherryPicking ||
    selectedCommits.length > 1;

  const items: {
    label: string;
    action: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
  }[] = [
    {
      label: `Copy Revision Number`,
      action: handleCopyHash,
      icon: <IconCopy />,
    },
    {
      label: "Cherry-Pick",
      action: handleCherryPick,
      icon: <IconCherryPick />,
    },
    {
      label: "Squash Commits...",
      action: handleSquash,
      disabled: isSquashCommitDisabled,
    },
    {
      label: "Edit Commit Message",
      action: handleEditCommitMessage,
      disabled: isEditCommitMessageDisabled,
    },
    {
      label: "Reset to Here (Mixed)",
      action: handleResetMixed,
      icon: <IconRevert />,
    },
    {
      label: "Reset to Here (Soft)",
      action: handleResetSoft,
      icon: <IconRevert />,
    },
    {
      label: "Reset to Here (Hard)",
      action: handleResetHard,
      icon: <IconRevert />,
    },
    { label: "Checkout Revision", action: handleCheckoutRevision },
    { label: "Revert Commit", action: handleRevert },
    {
      label: "Drop Commit",
      action: handleDropCommit,
      icon: <IconDrop />,
      disabled: isDropCommitDisabled,
    },
    { label: "New Branch...", action: handleNewBranch, icon: <IconBranch /> },
    { label: "New Tag...", action: handleNewTag, icon: <IconTag /> },
  ];

  // Add "Show in Git Log" when file filter is active
  if (filter.file) {
    items.push({
      label: "Show in Git Log",
      action: handleShowInGitLog,
      icon: <IconBranch />,
    });
  }

  const menu = (
    <div
      ref={menuRef}
      className="commit-context-menu"
      style={{
        position: "fixed",
        top: position ? position.top : -9999,
        left: position ? position.left : -9999,
        zIndex: 9999,
        maxHeight: "calc(100vh - 8px)",
        overflowY: "auto",
        visibility: position ? "visible" : "hidden",
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={`commit-context-menu-item${item.disabled ? " is-disabled" : ""}`}
          onClick={item.disabled ? undefined : item.action}
          aria-disabled={item.disabled || undefined}
        >
          <span className="commit-context-menu-icon">{item.icon ?? null}</span>
          {item.label}
        </div>
      ))}
      {squashDialogOpen && (
        <div
          className="squash-message-modal"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleCancelSquash();
          }}
        >
          <div
            className="squash-message-dialog"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="squash-message-dialog-title">
              Squashed Commit Message
            </div>
            <div className="squash-message-dialog-description">
              Edit message for {squashOrder.length} squashed commit
              {squashOrder.length === 1 ? "" : "s"}
            </div>
            <textarea
              className="squash-message-editor"
              value={squashMessage}
              onChange={(e) => {
                setSquashMessage(e.target.value);
                setSquashError("");
              }}
              autoFocus
              spellCheck={false}
            />
            {squashError && (
              <div className="squash-message-error">{squashError}</div>
            )}
            <div className="squash-message-dialog-actions">
              <button
                type="button"
                className="commit-btn commit-btn-secondary"
                onClick={handleCancelSquash}
              >
                Cancel
              </button>
              <button
                type="button"
                className="commit-btn commit-btn-secondary"
                onClick={handleConfirmSquash}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {editDialogOpen && (
        <div
          className="squash-message-modal"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleCancelEditCommitMessage();
          }}
        >
          <div
            className="squash-message-dialog"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="squash-message-dialog-title">
              Edit Commit Message
            </div>
            <div className="squash-message-dialog-description">
              Edit message for {shortHash}
            </div>
            <textarea
              className="squash-message-editor"
              value={editMessage}
              onChange={(e) => {
                setEditMessage(e.target.value);
                setEditError("");
              }}
              autoFocus
              spellCheck={false}
            />
            {editError && (
              <div className="squash-message-error">{editError}</div>
            )}
            <div className="squash-message-dialog-actions">
              <button
                type="button"
                className="commit-btn commit-btn-secondary"
                onClick={handleCancelEditCommitMessage}
              >
                Cancel
              </button>
              <button
                type="button"
                className="commit-btn commit-btn-secondary"
                onClick={handleConfirmEditCommitMessage}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
