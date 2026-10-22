import { useCallback } from "react";
import { NativeContextMenu } from "../../shared/components/NativeContextMenu";
import type { IdeaShelfEntry } from "../../shared/store/commit-store";
import { useCommitStore } from "../../shared/store/commit-store";

interface IdeaShelfContextMenuProps {
  x: number;
  y: number;
  entry: IdeaShelfEntry;
  onClose: () => void;
}

export function IdeaShelfContextMenu({
  x,
  y,
  entry,
  onClose,
}: IdeaShelfContextMenuProps) {
  const { ideaUnshelveChanges, deleteIdeaShelf } = useCommitStore();

  const handleUnshelve = useCallback(() => {
    ideaUnshelveChanges(entry.name, true);
    onClose();
  }, [entry, ideaUnshelveChanges, onClose]);

  const handleApply = useCallback(() => {
    ideaUnshelveChanges(entry.name, false);
    onClose();
  }, [entry, ideaUnshelveChanges, onClose]);

  const handleCreatePatch = useCallback(() => {
    import("../../shared/bridge").then(({ bridge }) => {
      bridge.request("createPatchFromShelf", { shelfName: entry.name });
    });
    onClose();
  }, [entry, onClose]);

  const handleCopyPatch = useCallback(() => {
    import("../../shared/bridge").then(({ bridge }) => {
      bridge.request("copyShelfPatchToClipboard", { shelfName: entry.name });
    });
    onClose();
  }, [entry, onClose]);

  const handleImportPatches = useCallback(() => {
    import("../../shared/bridge").then(({ bridge }) => {
      bridge.request("importPatches");
    });
    onClose();
  }, [onClose]);

  const handleImportFromClipboard = useCallback(() => {
    import("../../shared/bridge").then(({ bridge }) => {
      bridge.request("importPatchFromClipboard");
    });
    onClose();
  }, [onClose]);

  const handleDelete = useCallback(() => {
    deleteIdeaShelf(entry.name);
    onClose();
  }, [entry, deleteIdeaShelf, onClose]);

  return (
    <NativeContextMenu
      x={x}
      y={y}
      section="shelf"
      items={[
        { id: "unshelve", action: handleUnshelve },
        { id: "restore", action: handleApply },
        { id: "createPatch", action: handleCreatePatch },
        { id: "copyPatch", action: handleCopyPatch },
        { id: "importPatches", action: handleImportPatches },
        { id: "importClipboard", action: handleImportFromClipboard },
        { id: "delete", action: handleDelete },
      ]}
    />
  );
}
