import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bridge, bridgeWithProgress } from "../../shared/bridge";
import type { CommitShortcutEvent } from "../../shared/bridge/types";
import {
  NativeContextMenu,
  type NativeMenuItem,
} from "../../shared/components/NativeContextMenu";
import { usePanelStore } from "../../shared/store/panel-store";
import type { Commit } from "../../shared/types/git";
import { resetCommit } from "../actions/resetCommit";

interface CommitContextMenuProps {
  x: number;
  y: number;
  commit: Commit;
  onClose: () => void;
  onCreateBranch?: (hash: string, defaultName: string) => void;
  shortcut?: {
    action: CommitShortcutEvent["action"];
    onSettled: () => void;
  };
}

export function CommitContextMenu({
  x,
  y,
  commit,
  onClose,
  onCreateBranch,
  shortcut,
}: CommitContextMenuProps) {
  const currentBranch = usePanelStore((s) => s.currentBranch);
  const allCommits = usePanelStore((s) => s.commits);
  const selectedCommitHashes = usePanelStore((s) => s.selectedCommitHashes);
  const [repoStateReady, setRepoStateReady] = useState(false);
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
    let cancelled = false;
    const fetchRepoState = async () => {
      try {
        const [rebaseState, mergeState, cherryPickState] = await Promise.all([
          bridge.request("getRebaseState") as Promise<{ isRebasing: boolean }>,
          bridge.request("getMergeState") as Promise<{ isMerging: boolean }>,
          bridge.request("getCherryPickState") as Promise<{
            isCherryPicking: boolean;
          }>,
        ]);
        if (cancelled) return;
        setIsRebasing(rebaseState?.isRebasing ?? false);
        setIsMerging(mergeState?.isMerging ?? false);
        setIsCherryPicking(cherryPickState?.isCherryPicking ?? false);
      } catch {
        // Keep history edits disabled if repository state is unavailable.
        if (!cancelled) {
          setIsRebasing(true);
        }
      } finally {
        if (!cancelled) setRepoStateReady(true);
      }
    };
    fetchRepoState();
    return () => {
      cancelled = true;
    };
  }, []);

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
    await resetCommit(commit, currentBranch, "hard");
  };

  const handleResetMixed = async () => {
    onClose();
    await resetCommit(commit, currentBranch, "mixed");
  };

  const handleResetSoft = async () => {
    onClose();
    await resetCommit(commit, currentBranch, "soft");
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

  const items: NativeMenuItem[] = [
    { id: "copyHash", action: handleCopyHash },
    { id: "cherryPick", action: handleCherryPick },
    { id: "squash", action: handleSquash, disabled: isSquashCommitDisabled },
    {
      id: "editMessage",
      action: handleEditCommitMessage,
      disabled: isEditCommitMessageDisabled,
    },
    { id: "resetMixed", action: handleResetMixed },
    { id: "resetSoft", action: handleResetSoft },
    { id: "resetHard", action: handleResetHard },
    { id: "checkoutRevision", action: handleCheckoutRevision },
    { id: "revertCommit", action: handleRevert },
    { id: "newBranch", action: handleNewBranch },
    { id: "newTag", action: handleNewTag },
    ...(filter.file ? [{ id: "showInLog", action: handleShowInGitLog }] : []),
    {
      id: "dropCommit",
      action: handleDropCommit,
      disabled: isDropCommitDisabled,
    },
  ];

  const shortcutStarted = useRef(false);
  const shortcutState = useRef({ items, onClose, shortcut });
  shortcutState.current = { items, onClose, shortcut };
  useEffect(() => {
    if (!repoStateReady || !shortcut || shortcutStarted.current) return;
    shortcutStarted.current = true;
    const { items, onClose } = shortcutState.current;
    const item = items.find(({ id }) => id === shortcut.action);
    if (!item || item.disabled) {
      onClose();
      shortcut.onSettled();
      return;
    }
    // Reuse the menu handler, including its dialogs and repository guards.
    void Promise.resolve()
      .then(() => item.action())
      .catch((error) => {
        console.error("Commit shortcut failed:", error);
        onClose();
      })
      .finally(shortcut.onSettled);
  }, [repoStateReady, shortcut]);

  const menu = (
    <>
      {!shortcut && (
        <NativeContextMenu
          x={x}
          y={y}
          section="commit"
          items={items}
          ready={repoStateReady}
        />
      )}
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
    </>
  );

  return createPortal(menu, document.body);
}
