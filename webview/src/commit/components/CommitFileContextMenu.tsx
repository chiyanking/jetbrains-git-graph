import type { WorkingFileShortcutEvent } from "../../shared/bridge/types";
import { NativeContextMenu } from "../../shared/components/NativeContextMenu";
import type { WorkingTreeFile } from "../../shared/store/commit-store";
import { runWorkingFileAction } from "../actions/workingFileActions";

interface CommitFileContextMenuProps {
  x: number;
  y: number;
  file: WorkingTreeFile;
  onClose: () => void;
}

export function CommitFileContextMenu({
  x,
  y,
  file,
  onClose,
}: CommitFileContextMenuProps) {
  const actions: WorkingFileShortcutEvent["action"][] = [
    "showDiff",
    "jumpToSource",
    "systemFolder",
    file.staged ? "unstage" : "stage",
    "shelve",
    "rollback",
    "delete",
  ];

  return (
    <NativeContextMenu
      x={x}
      y={y}
      section="workingFile"
      items={actions.map((id) => ({
        id,
        action: () => {
          onClose();
          void runWorkingFileAction(id, file);
        },
      }))}
    />
  );
}
