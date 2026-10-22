import { useCallback } from "react";
import { NativeContextMenu } from "../../shared/components/NativeContextMenu";
import type { ShelveEntry } from "../../shared/store/commit-store";
import { useCommitStore } from "../../shared/store/commit-store";

interface ShelfContextMenuProps {
  x: number;
  y: number;
  entry: ShelveEntry;
  onClose: () => void;
}

export function ShelfContextMenu({
  x,
  y,
  entry,
  onClose,
}: ShelfContextMenuProps) {
  const { unshelveChanges, deleteShelve } = useCommitStore();

  const handleUnshelve = useCallback(() => {
    unshelveChanges(entry.id, true);
    onClose();
  }, [entry, unshelveChanges, onClose]);

  const handleApply = useCallback(() => {
    unshelveChanges(entry.id, false);
    onClose();
  }, [entry, unshelveChanges, onClose]);

  const handleDelete = useCallback(() => {
    deleteShelve(entry.id);
    onClose();
  }, [entry, deleteShelve, onClose]);

  return (
    <NativeContextMenu
      x={x}
      y={y}
      section="stash"
      items={[
        { id: "unshelve", action: handleUnshelve },
        { id: "restore", action: handleApply },
        { id: "delete", action: handleDelete },
      ]}
    />
  );
}
