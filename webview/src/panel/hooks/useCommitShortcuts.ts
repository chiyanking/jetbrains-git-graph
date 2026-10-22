import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "../../shared/bridge";
import type {
  CommitResetShortcutEvent,
  CommitShortcutEvent,
} from "../../shared/bridge/types";
import { usePanelStore } from "../../shared/store/panel-store";
import type { Commit } from "../../shared/types/git";
import { resetCommit } from "../actions/resetCommit";

const commitActions = new Set<CommitShortcutEvent["action"]>([
  "copyHash",
  "cherryPick",
  "editMessage",
  "checkoutRevision",
  "revertCommit",
  "newBranch",
  "newTag",
]);

interface ShortcutRequest {
  id: string;
  action: CommitShortcutEvent["action"];
  commit: Commit;
}

export function useCommitShortcuts() {
  const [request, setRequest] = useState<ShortcutRequest | null>(null);
  const pending = useRef<{
    id: string;
    closed: boolean;
    settled: boolean;
  } | null>(null);

  // A command can close its menu before its asynchronous work finishes, or open
  // a dialog after its handler returns. Keep the lock until both have finished.
  const finish = useCallback((id: string, phase: "closed" | "settled") => {
    if (pending.current?.id !== id) return;
    pending.current[phase] = true;
    if (phase === "closed") setRequest(null);
    if (pending.current.closed && pending.current.settled)
      pending.current = null;
  }, []);

  useEffect(
    () =>
      bridge.onEvent((event, data) => {
        if (
          (event !== "commitResetShortcut" && event !== "commitShortcut") ||
          !document.hasFocus()
        )
          return;
        const mode = (data as CommitResetShortcutEvent | null)?.mode;
        const action = (data as CommitShortcutEvent | null)?.action;
        let shortcut: CommitResetShortcutEvent | CommitShortcutEvent;
        if (event === "commitResetShortcut") {
          if (mode !== "mixed" && mode !== "soft" && mode !== "hard") return;
          shortcut = { mode };
        } else {
          if (!action || !commitActions.has(action)) return;
          shortcut = { action };
        }

        // Webviews do not expose their individual inputs to VS Code's inputFocus.
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active.closest("input, textarea, select, [contenteditable]")
        )
          return;
        if (document.querySelector('[role="dialog"], .squash-message-modal'))
          return;

        const state = usePanelStore.getState();
        if (
          pending.current ||
          state.operationInProgress ||
          state.loading ||
          state.selectedCommitHashes.length !== 1
        )
          return;
        const commit = state.visibleCommits.find(
          (candidate) => candidate.hash === state.selectedCommitHashes[0],
        );
        if (!commit) return;

        const id = crypto.randomUUID();
        pending.current = { id, closed: false, settled: false };
        if ("mode" in shortcut) {
          void resetCommit(commit, state.currentBranch, shortcut.mode).finally(
            () => {
              pending.current = null;
            },
          );
        } else {
          setRequest({ id, action: shortcut.action, commit });
        }
      }),
    [],
  );

  return { request, finish };
}
