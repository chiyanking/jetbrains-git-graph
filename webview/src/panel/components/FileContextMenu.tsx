import { bridge, bridgeWithProgress } from "../../shared/bridge";
import { NativeContextMenu } from "../../shared/components/NativeContextMenu";
import { usePanelStore } from "../../shared/store/panel-store";
import type { DiffFile } from "../../shared/types/git";

interface FileContextMenuProps {
  x: number;
  y: number;
  file: DiffFile;
  onClose: () => void;
}

export function FileContextMenu({ x, y, file, onClose }: FileContextMenuProps) {
  const selectedCommitHash = usePanelStore((s) => s.selectedCommitHash);
  const openDiffEditor = usePanelStore((s) => s.openDiffEditor);
  const filePath = file.newPath || file.oldPath;

  const handleShowDiff = () => {
    onClose();
    if (selectedCommitHash) {
      openDiffEditor(selectedCommitHash, file);
    }
  };

  const handleEditSource = async () => {
    onClose();
    try {
      await bridge.request("openFile", { filePath });
    } catch (err) {
      console.error("Open file failed:", err);
    }
  };

  const handleOpenRepoVersion = async () => {
    onClose();
    if (selectedCommitHash) {
      try {
        await bridge.request("openFileAtRevision", {
          filePath,
          ref: selectedCommitHash,
        });
      } catch (err) {
        console.error("Open repo version failed:", err);
      }
    }
  };

  const handleCopyPath = async () => {
    onClose();
    try {
      await bridge.request("copyToClipboard", { text: filePath });
    } catch (err) {
      console.error("Copy path failed:", err);
    }
  };

  const handleCopyFileName = async () => {
    onClose();
    const fileName = filePath.split("/").pop() ?? filePath;
    try {
      await bridge.request("copyToClipboard", { text: fileName });
    } catch (err) {
      console.error("Copy filename failed:", err);
    }
  };

  const handleRevertFileChanges = async () => {
    onClose();
    if (!selectedCommitHash) return;
    const result = (await bridge.request("showConfirmMessage", {
      message: `Revert changes to '${filePath.split("/").pop()}' from this commit?`,
      confirmLabel: "Revert",
    })) as { confirmed: boolean };
    if (!result.confirmed) return;
    try {
      await bridgeWithProgress("revertFileChanges", {
        hash: selectedCommitHash,
        filePath,
        status: file.status,
      });
    } catch (err) {
      console.error("Revert file changes failed:", err);
    }
  };

  const handleCherryPickFileChanges = async () => {
    onClose();
    if (!selectedCommitHash) return;
    const result = (await bridge.request("showConfirmMessage", {
      message: `Apply changes to '${filePath.split("/").pop()}' from this commit to working tree?`,
      confirmLabel: "Apply",
    })) as { confirmed: boolean };
    if (!result.confirmed) return;
    try {
      await bridgeWithProgress("cherryPickFileChanges", {
        hash: selectedCommitHash,
        filePath,
      });
    } catch (err) {
      console.error("Cherry-pick file changes failed:", err);
    }
  };

  const handleHistoryUpToHere = () => {
    onClose();
    usePanelStore.getState().setFilter({ file: filePath });
  };

  return (
    <NativeContextMenu
      x={x}
      y={y}
      section="logFile"
      items={[
        { id: "showDiff", action: handleShowDiff },
        { id: "editSource", action: handleEditSource },
        { id: "repoVersion", action: handleOpenRepoVersion },
        { id: "revertFile", action: handleRevertFileChanges },
        { id: "cherryPickFile", action: handleCherryPickFileChanges },
        { id: "copyPath", action: handleCopyPath },
        { id: "copyFileName", action: handleCopyFileName },
        { id: "history", action: handleHistoryUpToHere },
      ]}
    />
  );
}
