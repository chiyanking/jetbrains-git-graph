import { useCallback } from "react";
import { bridge } from "../../shared/bridge";
import { NativeContextMenu } from "../../shared/components/NativeContextMenu";

interface ShelfFileContextMenuProps {
  x: number;
  y: number;
  filePath: string;
  stashId: string;
  onClose: () => void;
}

export function ShelfFileContextMenu({
  x,
  y,
  filePath,
  stashId,
  onClose,
}: ShelfFileContextMenuProps) {
  const handleShowDiff = useCallback(() => {
    bridge.request("showShelfFileDiff", { stashId, filePath });
    onClose();
  }, [stashId, filePath, onClose]);

  const handleUnshelveFile = useCallback(() => {
    bridge.request("unshelveFile", { stashId, filePath });
    onClose();
  }, [stashId, filePath, onClose]);

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
      section="stashFile"
      items={[
        { id: "unshelveFile", action: handleUnshelveFile },
        { id: "showDiff", action: handleShowDiff },
        { id: "jumpToSource", action: handleJumpToSource },
        { id: "copyPath", action: handleCopyPath },
      ]}
    />
  );
}
