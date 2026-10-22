import { useCallback, useEffect, useState } from "react";
import { NativeContextMenu } from "../../shared/components/NativeContextMenu";
import {
  type IdeaShelfEntry,
  useCommitStore,
} from "../../shared/store/commit-store";
import { getCommitFileIcon } from "../utils/file-icon";
import { IdeaShelfContextMenu } from "./IdeaShelfContextMenu";
import { IdeaShelfFileContextMenu } from "./IdeaShelfFileContextMenu";

export function IdeaShelfTab() {
  const { ideaShelves, fetchIdeaShelves } = useCommitStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    requestId: string;
    x: number;
    y: number;
    entry: IdeaShelfEntry;
  } | null>(null);
  const [fileContextMenu, setFileContextMenu] = useState<{
    requestId: string;
    x: number;
    y: number;
    filePath: string;
    shelfName: string;
  } | null>(null);
  const [bgContextMenu, setBgContextMenu] = useState<{
    requestId: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    fetchIdeaShelves();
  }, [fetchIdeaShelves]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: IdeaShelfEntry) => {
      e.preventDefault();
      e.stopPropagation();
      setFileContextMenu(null);
      setContextMenu({
        requestId: crypto.randomUUID(),
        x: e.clientX,
        y: e.clientY,
        entry,
      });
    },
    [],
  );

  const handleFileContextMenu = useCallback(
    (e: React.MouseEvent, filePath: string, shelfName: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu(null);
      setFileContextMenu({
        requestId: crypto.randomUUID(),
        x: e.clientX,
        y: e.clientY,
        filePath,
        shelfName,
      });
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeFileContextMenu = useCallback(() => {
    setFileContextMenu(null);
  }, []);

  const handleBgContextMenu = useCallback((e: React.MouseEvent) => {
    // Only show if right-clicking on the background (not on an item)
    if ((e.target as HTMLElement).closest(".shelf-item-container")) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setFileContextMenu(null);
    setBgContextMenu({
      requestId: crypto.randomUUID(),
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const closeBgContextMenu = useCallback(() => {
    setBgContextMenu(null);
  }, []);

  if (ideaShelves.length === 0) {
    return (
      <div className="shelf-list" onContextMenu={handleBgContextMenu}>
        <div className="shelf-empty">
          <p>No shelved changes</p>
          <p style={{ fontSize: 11, marginTop: 8 }}>
            Use the shelf icon in the Commit tab toolbar to shelve changes to
            .idea/shelf/ (IDEA-compatible format).
          </p>
        </div>
        {bgContextMenu && (
          <ShelfBgContextMenu
            key={bgContextMenu.requestId}
            x={bgContextMenu.x}
            y={bgContextMenu.y}
            onClose={closeBgContextMenu}
          />
        )}
      </div>
    );
  }

  return (
    <div className="shelf-list" onContextMenu={handleBgContextMenu}>
      {ideaShelves.map((entry) => (
        <IdeaShelfItem
          key={entry.name}
          entry={entry}
          expanded={expandedIds.has(entry.name)}
          onToggle={() => toggleExpand(entry.name)}
          onContextMenu={(e) => handleContextMenu(e, entry)}
          onFileContextMenu={handleFileContextMenu}
        />
      ))}
      {contextMenu && (
        <IdeaShelfContextMenu
          key={contextMenu.requestId}
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          onClose={closeContextMenu}
        />
      )}
      {fileContextMenu && (
        <IdeaShelfFileContextMenu
          key={fileContextMenu.requestId}
          x={fileContextMenu.x}
          y={fileContextMenu.y}
          filePath={fileContextMenu.filePath}
          shelfName={fileContextMenu.shelfName}
          onClose={closeFileContextMenu}
        />
      )}
      {bgContextMenu && (
        <ShelfBgContextMenu
          key={bgContextMenu.requestId}
          x={bgContextMenu.x}
          y={bgContextMenu.y}
          onClose={closeBgContextMenu}
        />
      )}
    </div>
  );
}

interface IdeaShelfItemProps {
  entry: IdeaShelfEntry;
  expanded: boolean;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onFileContextMenu: (
    e: React.MouseEvent,
    filePath: string,
    shelfName: string,
  ) => void;
}

function IdeaShelfItem({
  entry,
  expanded,
  onToggle,
  onContextMenu,
  onFileContextMenu,
}: IdeaShelfItemProps) {
  const dateStr = formatDate(entry.date);

  return (
    <div className="shelf-item-container" onContextMenu={onContextMenu}>
      <div className="shelf-item-row" onClick={onToggle}>
        <span className={`shelf-item-chevron ${expanded ? "" : "collapsed"}`}>
          <ChevronIcon />
        </span>
        <span className="shelf-item-title">
          {entry.description || entry.name}
        </span>
        <span className="shelf-item-info">
          {entry.files.length} {entry.files.length === 1 ? "file" : "files"},{" "}
          {dateStr}
        </span>
      </div>

      {expanded && entry.files.length > 0 && (
        <div className="shelf-item-file-list">
          {entry.files.map((filePath) => (
            <IdeaShelfFileRow
              key={filePath}
              filePath={filePath}
              onContextMenu={(e) => onFileContextMenu(e, filePath, entry.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IdeaShelfFileRow({
  filePath,
  onContextMenu,
}: {
  filePath: string;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const parts = filePath.split("/");
  const fileName = parts.pop() || filePath;
  const dirPath = parts.length > 0 ? parts.join("/") : "";
  const FileIcon = getCommitFileIcon(filePath);

  return (
    <div
      className="shelf-file-row"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
    >
      <span className="shelf-file-icon">
        <FileIcon style={{ width: 16, height: 16 }} />
      </span>
      <span className="shelf-file-name">{fileName}</span>
      {dirPath && <span className="shelf-file-path">{dirPath}</span>}
    </div>
  );
}

function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffHr / 24);

  if (diffHr < 1) return "just now";
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear() % 100;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 11.5L9.5 8L6 4.5"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─── Background Context Menu (right-click on empty area) ────────── */

function ShelfBgContextMenu({
  x,
  y,
  onClose,
}: {
  x: number;
  y: number;
  onClose: () => void;
}) {
  return (
    <NativeContextMenu
      x={x}
      y={y}
      section="shelfBackground"
      items={[
        {
          id: "importPatches",
          action: () => {
            import("../../shared/bridge").then(({ bridge }) =>
              bridge.request("importPatches"),
            );
            onClose();
          },
        },
        {
          id: "importClipboard",
          action: () => {
            import("../../shared/bridge").then(({ bridge }) =>
              bridge.request("importPatchFromClipboard"),
            );
            onClose();
          },
        },
      ]}
    />
  );
}
