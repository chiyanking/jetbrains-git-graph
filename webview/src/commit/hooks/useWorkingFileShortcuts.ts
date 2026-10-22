import { useEffect, useRef } from "react";
import { bridge } from "../../shared/bridge";
import type { WorkingFileShortcutEvent } from "../../shared/bridge/types";
import { useCommitStore } from "../../shared/store/commit-store";
import { runWorkingFileAction } from "../actions/workingFileActions";

const actions = new Set<WorkingFileShortcutEvent["action"]>([
  "showDiff",
  "jumpToSource",
  "systemFolder",
  "stage",
  "unstage",
  "shelve",
  "rollback",
  "delete",
]);

export function useWorkingFileShortcuts() {
  const running = useRef(false);

  useEffect(
    () =>
      bridge.onEvent((event, data) => {
        if (event !== "workingFileShortcut" || !document.hasFocus()) return;
        const action = (data as WorkingFileShortcutEvent | null)?.action;
        if (!action || !actions.has(action)) return;
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active.closest("input, textarea, select, [contenteditable]")
        )
          return;
        if (document.querySelector('[role="dialog"], .app-dialog-overlay'))
          return;

        const state = useCommitStore.getState();
        if (running.current || state.loading || state.activeTab !== "commit")
          return;
        const files = state.changes.filter((file) =>
          state.highlightedFiles.has(`${file.path}:${file.staged}`),
        );
        if (files.length === 0) return;
        if (
          !state.showUnversioned &&
          files.some((file) => file.status === "untracked")
        )
          return;
        // Single-file actions need an unambiguous target; shelf/delete support a selection.
        if (files.length > 1 && action !== "shelve" && action !== "delete")
          return;

        running.current = true;
        void runWorkingFileAction(action, files[0]).finally(() => {
          running.current = false;
        });
      }),
    [],
  );
}
