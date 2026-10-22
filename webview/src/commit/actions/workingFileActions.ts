import { bridge } from "../../shared/bridge";
import type { WorkingFileShortcutEvent } from "../../shared/bridge/types";
import {
  useCommitStore,
  type WorkingTreeFile,
} from "../../shared/store/commit-store";

/** Share file targeting and confirmation flows between menus and shortcuts. */
export async function runWorkingFileAction(
  action: WorkingFileShortcutEvent["action"],
  file: WorkingTreeFile,
): Promise<void> {
  const state = useCommitStore.getState();
  const fileKey = `${file.path}:${file.staged}`;
  const selected =
    state.highlightedFiles.size > 1 && state.highlightedFiles.has(fileKey)
      ? state.changes.filter((candidate) =>
          state.highlightedFiles.has(`${candidate.path}:${candidate.staged}`),
        )
      : [file];
  const paths = [...new Set(selected.map((candidate) => candidate.path))];
  if (paths.length === 0) return;

  try {
    switch (action) {
      case "showDiff":
        await state.showDiff(file.path, file.staged);
        break;
      case "jumpToSource":
        await bridge.request("openFile", { filePath: file.path });
        break;
      case "systemFolder":
        await bridge.request("revealInSystemExplorer", { filePath: file.path });
        break;
      case "stage":
        if (!file.staged) await state.stageFile(file.path);
        break;
      case "unstage":
        if (file.staged) await state.unstageFile(file.path);
        break;
      case "shelve":
        await state.shelveChanges("Shelved changes", paths);
        break;
      case "rollback":
        await state.rollbackFile(file.path);
        break;
      case "delete":
        await bridge.request("deleteFiles", { filePaths: paths });
        break;
    }
  } catch (err) {
    console.error("File action failed:", err);
  }
}
