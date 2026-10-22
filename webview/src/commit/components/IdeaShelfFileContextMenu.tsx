import { useCallback } from "react";
import { bridge } from "../../shared/bridge";
import { NativeContextMenu } from "../../shared/components/NativeContextMenu";

interface IdeaShelfFileContextMenuProps {
  x: number;
  y: number;
  filePath: string;
  shelfName: string;
  onClose: () => void;
}

export function IdeaShelfFileContextMenu({
  x,
  y,
  filePath,
  shelfName,
  onClose,
}: IdeaShelfFileContextMenuProps) {
  const handleShowDiff = useCallback(() => {
    bridge.request("showIdeaShelfFileDiff", { shelfName, filePath });
    onClose();
  }, [shelfName, filePath, onClose]);

  const handleJumpToSource = useCallback(() => {
    bridge.request("openFile", { filePath });
    onClose();
  }, [filePath, onClose]);

  const handleCopyPath = useCallback(() => {
    bridge.request("copyToClipboard", { text: filePath });
    onClose();
  }, [filePath, onClose]);

  return (
    <NativeContextMenu
      x={x}
      y={y}
      section="shelfFile"
      items={[
        { id: "showDiff", action: handleShowDiff },
        { id: "jumpToSource", action: handleJumpToSource },
        { id: "copyPath", action: handleCopyPath },
      ]}
    />
  );
}
