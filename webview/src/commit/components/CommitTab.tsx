import { useCallback, useMemo, useState } from "react";
import { bridge } from "../../shared/bridge";
import { NativeContextMenu } from "../../shared/components/NativeContextMenu";
import {
  useCommitStore,
  type WorkingTreeFile,
} from "../../shared/store/commit-store";
import { useWorkingFileShortcuts } from "../hooks/useWorkingFileShortcuts";
import { CommitFileContextMenu } from "./CommitFileContextMenu";
import { CommitMessageArea } from "./CommitMessageArea";
import { FileItem } from "./FileItem";
import { Toolbar } from "./Toolbar";

export function CommitTab() {
  useWorkingFileShortcuts();
  const {
    changes,
    selectedFiles,
    highlightedFiles,
    expandedGroups,
    groupByDirectory,
    showUnversioned,
    toggleGroup,
    toggleFileSelection,
    setFileKeys,
    highlightFile,
    showDiff,
    fetchChanges,
    ideaShelveChanges,
  } = useCommitStore();

  const [contextMenu, setContextMenu] = useState<{
    requestId: string;
    x: number;
    y: number;
    file: WorkingTreeFile;
  } | null>(null);

  const [dirContextMenu, setDirContextMenu] = useState<{
    requestId: string;
    x: number;
    y: number;
    files: WorkingTreeFile[];
    dirName: string;
  } | null>(null);

  // Group files: staged (Changes) vs unstaged/untracked (Unversioned Files)
  const { stagedFiles, changedFiles, untrackedFiles, conflictedFiles } =
    useMemo(() => {
      const staged: WorkingTreeFile[] = [];
      const changed: WorkingTreeFile[] = [];
      const untracked: WorkingTreeFile[] = [];
      const conflicted: WorkingTreeFile[] = [];

      for (const file of changes) {
        if (file.status === "conflicted") {
          conflicted.push(file);
        } else if (file.staged) {
          staged.push(file);
        } else if (file.status === "untracked") {
          untracked.push(file);
        } else {
          changed.push(file);
        }
      }
      return {
        stagedFiles: staged,
        changedFiles: changed,
        untrackedFiles: untracked,
        conflictedFiles: conflicted,
      };
    }, [changes]);

  const handleShelveSelected = useCallback(async () => {
    const selectedPaths = changes
      .filter((f) => selectedFiles.has(`${f.path}:${f.staged}`))
      .map((f) => f.path);
    if (selectedPaths.length === 0) return;
    await ideaShelveChanges("Shelved changes", [...new Set(selectedPaths)]);
  }, [changes, selectedFiles, ideaShelveChanges]);

  const hasSelectedChanges = useMemo(
    () =>
      changes.some((file) => selectedFiles.has(`${file.path}:${file.staged}`)),
    [changes, selectedFiles],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, file: WorkingTreeFile) => {
      const state = useCommitStore.getState();
      const key = `${file.path}:${file.staged}`;
      if (!state.highlightedFiles.has(key)) state.highlightFile(key, "single");
      setContextMenu({
        requestId: crypto.randomUUID(),
        x: e.clientX,
        y: e.clientY,
        file,
      });
      setDirContextMenu(null);
    },
    [],
  );

  const handleDirContextMenu = useCallback(
    (e: React.MouseEvent, files: WorkingTreeFile[], dirName: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDirContextMenu({
        requestId: crypto.randomUUID(),
        x: e.clientX,
        y: e.clientY,
        files,
        dirName,
      });
      setContextMenu(null);
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeDirContextMenu = useCallback(() => {
    setDirContextMenu(null);
  }, []);

  return (
    <div
      className="commit-tab-content"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <Toolbar
        onRefresh={() => {
          fetchChanges();
          bridge.request("refreshGitState");
        }}
        onShelve={handleShelveSelected}
        onRollback={() => {
          // Rollback operates on the files checked in the local changes list.
          // A path can appear twice when it has both staged and unstaged changes;
          // rollbackFile restores the whole path, so send it only once.
          const selectedPaths = changes
            .filter((file) => selectedFiles.has(`${file.path}:${file.staged}`))
            .map((file) => file.path);
          const uniquePaths = [...new Set(selectedPaths)];

          if (uniquePaths.length > 0) {
            bridge.request("rollbackFiles", { filePaths: uniquePaths });
          }
        }}
        hasChanges={changes.length > 0}
        hasSelectedChanges={hasSelectedChanges}
      />

      <div className="commit-file-list">
        {/* Merge Conflicts */}
        {conflictedFiles.length > 0 && (
          <FileGroup
            label="Merge Conflicts"
            files={conflictedFiles}
            count={conflictedFiles.length}
            expanded={expandedGroups.has("conflicts")}
            groupByDirectory={groupByDirectory}
            onToggle={() => toggleGroup("conflicts")}
            selectedFiles={selectedFiles}
            highlightedFiles={highlightedFiles}
            onToggleFile={toggleFileSelection}
            onSetFileKeys={setFileKeys}
            onHighlightFile={highlightFile}
            onShowDiff={showDiff}
            onContextMenu={handleContextMenu}
            onDirContextMenu={handleDirContextMenu}
            action={
              <span
                className="commit-group-resolve-link"
                onClick={(e) => {
                  e.stopPropagation();
                  bridge.request("openConflictsPanel");
                }}
                onKeyDown={() => {}}
                role="button"
                tabIndex={0}
              >
                Resolve
              </span>
            }
          />
        )}

        {/* Changes (tracked, modified) */}
        {changedFiles.length > 0 && (
          <FileGroup
            label="Changes"
            files={changedFiles}
            count={changedFiles.length}
            expanded={expandedGroups.has("changes")}
            groupByDirectory={groupByDirectory}
            onToggle={() => toggleGroup("changes")}
            selectedFiles={selectedFiles}
            highlightedFiles={highlightedFiles}
            onToggleFile={toggleFileSelection}
            onSetFileKeys={setFileKeys}
            onHighlightFile={highlightFile}
            onShowDiff={showDiff}
            onContextMenu={handleContextMenu}
            onDirContextMenu={handleDirContextMenu}
          />
        )}

        {/* Staged files */}
        {stagedFiles.length > 0 && (
          <FileGroup
            label="Staged"
            files={stagedFiles}
            count={stagedFiles.length}
            expanded={expandedGroups.has("staged")}
            groupByDirectory={groupByDirectory}
            onToggle={() => toggleGroup("staged")}
            selectedFiles={selectedFiles}
            highlightedFiles={highlightedFiles}
            onToggleFile={toggleFileSelection}
            onSetFileKeys={setFileKeys}
            onHighlightFile={highlightFile}
            onShowDiff={showDiff}
            onContextMenu={handleContextMenu}
            onDirContextMenu={handleDirContextMenu}
          />
        )}

        {/* Unversioned Files */}
        {showUnversioned && untrackedFiles.length > 0 && (
          <FileGroup
            label="Unversioned Files"
            files={untrackedFiles}
            count={untrackedFiles.length}
            expanded={expandedGroups.has("unversioned")}
            groupByDirectory={groupByDirectory}
            onToggle={() => toggleGroup("unversioned")}
            selectedFiles={selectedFiles}
            highlightedFiles={highlightedFiles}
            onToggleFile={toggleFileSelection}
            onSetFileKeys={setFileKeys}
            onHighlightFile={highlightFile}
            onShowDiff={showDiff}
            onContextMenu={handleContextMenu}
            onDirContextMenu={handleDirContextMenu}
          />
        )}

        {changes.length === 0 && (
          <div className="shelf-empty">No changes detected</div>
        )}
      </div>

      <CommitMessageArea />

      {contextMenu && (
        <CommitFileContextMenu
          key={contextMenu.requestId}
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          onClose={closeContextMenu}
        />
      )}
      {dirContextMenu && (
        <DirContextMenu
          key={dirContextMenu.requestId}
          x={dirContextMenu.x}
          y={dirContextMenu.y}
          files={dirContextMenu.files}
          onClose={closeDirContextMenu}
        />
      )}
    </div>
  );
}

interface FileGroupProps {
  label: string;
  files: WorkingTreeFile[];
  count: number;
  expanded: boolean;
  groupByDirectory: boolean;
  onToggle: () => void;
  selectedFiles: Set<string>;
  highlightedFiles: Set<string>;
  onToggleFile: (key: string) => void;
  onSetFileKeys: (keys: string[], selected: boolean) => void;
  onHighlightFile: (key: string, mode: "single" | "toggle") => void;
  onShowDiff: (path: string, staged?: boolean) => Promise<void>;
  onContextMenu: (e: React.MouseEvent, file: WorkingTreeFile) => void;
  onDirContextMenu: (
    e: React.MouseEvent,
    files: WorkingTreeFile[],
    dirName: string,
  ) => void;
  action?: React.ReactNode;
}

function FileGroup({
  label,
  files,
  count,
  expanded,
  groupByDirectory,
  onToggle,
  selectedFiles,
  highlightedFiles,
  onToggleFile,
  onSetFileKeys,
  onHighlightFile,
  onShowDiff,
  onContextMenu,
  onDirContextMenu,
  action,
}: FileGroupProps) {
  const allKeys = useMemo(
    () => files.map((f) => `${f.path}:${f.staged}`),
    [files],
  );
  const allSelected = allKeys.every((k) => selectedFiles.has(k));
  const someSelected = allKeys.some((k) => selectedFiles.has(k));

  const handleGroupCheckbox = () => {
    if (allSelected) {
      onSetFileKeys(allKeys, false);
    } else {
      onSetFileKeys(allKeys, true);
    }
  };

  // Build flat ordered list of visible file keys for keyboard navigation
  const { collapsedDirs } = useCommitStore();
  const visibleKeys = useMemo(() => {
    if (!expanded) return [];
    if (!groupByDirectory) {
      return files.map((f) => `${f.path}:${f.staged}`);
    }
    // In directory mode, walk the tree respecting collapsed state
    const tree = buildDirTree(files);
    const keys: string[] = [];
    function walk(node: DirNode) {
      for (const child of [...node.children].sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        if (!collapsedDirs.has(child.fullPath)) {
          walk(child);
        }
      }
      for (const file of node.files) {
        keys.push(`${file.path}:${file.staged}`);
      }
    }
    walk(tree);
    return keys;
  }, [expanded, groupByDirectory, files, collapsedDirs]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();

      if (visibleKeys.length === 0) return;

      // Find current highlighted index
      let currentIdx = -1;
      for (let i = 0; i < visibleKeys.length; i++) {
        if (highlightedFiles.has(visibleKeys[i])) {
          currentIdx = i;
          break;
        }
      }

      let nextIdx: number;
      if (e.key === "ArrowDown") {
        nextIdx =
          currentIdx < visibleKeys.length - 1 ? currentIdx + 1 : currentIdx;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : 0;
      }

      onHighlightFile(visibleKeys[nextIdx], "single");
    },
    [visibleKeys, highlightedFiles, onHighlightFile],
  );

  return (
    <div className="commit-group">
      <div className="commit-group-header" onClick={onToggle}>
        <input
          type="checkbox"
          className="commit-group-checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected && !allSelected;
          }}
          onChange={(e) => {
            e.stopPropagation();
            handleGroupCheckbox();
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <span className={`commit-group-chevron ${expanded ? "" : "collapsed"}`}>
          <ChevronIcon />
        </span>
        {label}
        <span className="commit-group-count">
          {count} {count === 1 ? "file" : "files"}
        </span>
        {action}
      </div>
      {expanded && (
        <div
          className="commit-group-files"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {groupByDirectory ? (
            <DirectoryTree
              files={files}
              selectedFiles={selectedFiles}
              highlightedFiles={highlightedFiles}
              onToggleFile={onToggleFile}
              onSetFileKeys={onSetFileKeys}
              onHighlightFile={onHighlightFile}
              onShowDiff={onShowDiff}
              onContextMenu={onContextMenu}
              onDirContextMenu={onDirContextMenu}
            />
          ) : (
            files.map((file) => {
              const key = `${file.path}:${file.staged}`;
              return (
                <FileItem
                  key={key}
                  file={file}
                  selected={selectedFiles.has(key)}
                  highlighted={highlightedFiles.has(key)}
                  onToggle={() => onToggleFile(key)}
                  onShowDiff={() => onShowDiff(file.path, file.staged)}
                  onContextMenu={(e) => onContextMenu(e, file)}
                  onClick={(e) => {
                    const mode = e.metaKey || e.ctrlKey ? "toggle" : "single";
                    onHighlightFile(key, mode);
                  }}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Directory Tree View ────────────────────────────────────────── */

interface DirNode {
  name: string;
  fullPath: string;
  children: DirNode[];
  files: WorkingTreeFile[];
}

function buildDirTree(files: WorkingTreeFile[]): DirNode {
  const root: DirNode = { name: "", fullPath: "", children: [], files: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    parts.pop(); // remove filename, we only need directory parts
    let current = root;

    for (const part of parts) {
      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          fullPath: current.fullPath ? `${current.fullPath}/${part}` : part,
          children: [],
          files: [],
        };
        current.children.push(child);
      }
      current = child;
    }
    current.files.push(file);
  }

  // Compact single-child directories (src/git → src/git)
  compactDirNode(root);
  return root;
}

function compactDirNode(node: DirNode) {
  for (const child of node.children) {
    while (child.children.length === 1 && child.files.length === 0) {
      const grandchild = child.children[0];
      child.name = `${child.name}/${grandchild.name}`;
      child.fullPath = grandchild.fullPath;
      child.children = grandchild.children;
      child.files = grandchild.files;
    }
    compactDirNode(child);
  }
}

/** Collect all file keys recursively under a DirNode */
function collectFileKeys(node: DirNode): string[] {
  const keys: string[] = [];
  for (const file of node.files) {
    keys.push(`${file.path}:${file.staged}`);
  }
  for (const child of node.children) {
    keys.push(...collectFileKeys(child));
  }
  return keys;
}

function DirectoryTree({
  files,
  selectedFiles,
  highlightedFiles,
  onToggleFile,
  onSetFileKeys,
  onHighlightFile,
  onShowDiff,
  onContextMenu,
  onDirContextMenu,
}: {
  files: WorkingTreeFile[];
  selectedFiles: Set<string>;
  highlightedFiles: Set<string>;
  onToggleFile: (key: string) => void;
  onSetFileKeys: (keys: string[], selected: boolean) => void;
  onHighlightFile: (key: string, mode: "single" | "toggle") => void;
  onShowDiff: (path: string, staged?: boolean) => Promise<void>;
  onContextMenu: (e: React.MouseEvent, file: WorkingTreeFile) => void;
  onDirContextMenu: (
    e: React.MouseEvent,
    files: WorkingTreeFile[],
    dirName: string,
  ) => void;
}) {
  const { collapsedDirs, toggleDir } = useCommitStore();
  const tree = useMemo(() => buildDirTree(files), [files]);

  return (
    <DirNodeView
      node={tree}
      depth={0}
      collapsed={collapsedDirs}
      toggleDir={toggleDir}
      selectedFiles={selectedFiles}
      highlightedFiles={highlightedFiles}
      onToggleFile={onToggleFile}
      onSetFileKeys={onSetFileKeys}
      onHighlightFile={onHighlightFile}
      onShowDiff={onShowDiff}
      onContextMenu={onContextMenu}
      onDirContextMenu={onDirContextMenu}
    />
  );
}

function DirNodeView({
  node,
  depth,
  collapsed,
  toggleDir,
  selectedFiles,
  highlightedFiles,
  onToggleFile,
  onSetFileKeys,
  onHighlightFile,
  onShowDiff,
  onContextMenu,
  onDirContextMenu,
}: {
  node: DirNode;
  depth: number;
  collapsed: Set<string>;
  toggleDir: (path: string) => void;
  selectedFiles: Set<string>;
  highlightedFiles: Set<string>;
  onToggleFile: (key: string) => void;
  onSetFileKeys: (keys: string[], selected: boolean) => void;
  onHighlightFile: (key: string, mode: "single" | "toggle") => void;
  onShowDiff: (path: string, staged?: boolean) => Promise<void>;
  onContextMenu: (e: React.MouseEvent, file: WorkingTreeFile) => void;
  onDirContextMenu: (
    e: React.MouseEvent,
    files: WorkingTreeFile[],
    dirName: string,
  ) => void;
}) {
  return (
    <>
      {/* Render subdirectories */}
      {node.children
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((child) => {
          const isCollapsed = collapsed.has(child.fullPath);
          const childKeys = collectFileKeys(child);
          const allChecked =
            childKeys.length > 0 &&
            childKeys.every((k) => selectedFiles.has(k));
          const someChecked = childKeys.some((k) => selectedFiles.has(k));

          return (
            <div key={child.fullPath}>
              <div
                className="commit-dir-row"
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                onClick={() => toggleDir(child.fullPath)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const allFiles = collectDirFiles(child);
                  onDirContextMenu(e, allFiles, child.name);
                }}
              >
                <span
                  className={`commit-group-chevron ${isCollapsed ? "collapsed" : ""}`}
                >
                  <ChevronIcon />
                </span>
                <input
                  type="checkbox"
                  className="commit-dir-checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked && !allChecked;
                  }}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (allChecked) {
                      onSetFileKeys(childKeys, false);
                    } else {
                      onSetFileKeys(childKeys, true);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <FolderIcon />
                <span className="commit-dir-name">{child.name}</span>
                <span className="commit-dir-count">
                  {countFiles(child)}{" "}
                  {countFiles(child) === 1 ? "file" : "files"}
                </span>
              </div>
              {!isCollapsed && (
                <DirNodeView
                  node={child}
                  depth={depth + 1}
                  collapsed={collapsed}
                  toggleDir={toggleDir}
                  selectedFiles={selectedFiles}
                  highlightedFiles={highlightedFiles}
                  onToggleFile={onToggleFile}
                  onSetFileKeys={onSetFileKeys}
                  onHighlightFile={onHighlightFile}
                  onShowDiff={onShowDiff}
                  onContextMenu={onContextMenu}
                  onDirContextMenu={onDirContextMenu}
                />
              )}
            </div>
          );
        })}
      {/* Render files in this directory */}
      {node.files.map((file) => {
        const key = `${file.path}:${file.staged}`;
        return (
          <div key={key} style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
            <FileItem
              file={{ ...file, path: file.path.split("/").pop() || file.path }}
              selected={selectedFiles.has(key)}
              highlighted={highlightedFiles.has(key)}
              onToggle={() => onToggleFile(key)}
              onShowDiff={() => onShowDiff(file.path, file.staged)}
              onContextMenu={(e) => onContextMenu(e, file)}
              onClick={(e) => {
                const mode = e.metaKey || e.ctrlKey ? "toggle" : "single";
                onHighlightFile(key, mode);
              }}
            />
          </div>
        );
      })}
    </>
  );
}

function countFiles(node: DirNode): number {
  let count = node.files.length;
  for (const child of node.children) {
    count += countFiles(child);
  }
  return count;
}

function collectDirFiles(node: DirNode): WorkingTreeFile[] {
  const result: WorkingTreeFile[] = [...node.files];
  for (const child of node.children) {
    result.push(...collectDirFiles(child));
  }
  return result;
}

/* ─── Directory Context Menu ─────────────────────────────────────── */

function DirContextMenu({
  x,
  y,
  files,
  onClose,
}: {
  x: number;
  y: number;
  files: WorkingTreeFile[];
  onClose: () => void;
}) {
  const handleDelete = useCallback(() => {
    const paths = files.map((f) => f.path);
    import("../../shared/bridge").then(({ bridge }) => {
      bridge.request("deleteFiles", { filePaths: paths });
    });
    onClose();
  }, [files, onClose]);

  const handleRollback = useCallback(() => {
    const paths = files.map((f) => f.path);
    import("../../shared/bridge").then(({ bridge }) => {
      bridge.request("rollbackFiles", { filePaths: paths });
    });
    onClose();
  }, [files, onClose]);

  const handleOpenInSystemFolder = useCallback(() => {
    const firstFile = files[0];
    if (firstFile) {
      import("../../shared/bridge").then(({ bridge }) => {
        bridge.request("revealInSystemExplorer", { filePath: firstFile.path });
      });
    }
    onClose();
  }, [files, onClose]);

  return (
    <NativeContextMenu
      x={x}
      y={y}
      section="workingDirectory"
      items={[
        { id: "rollback", action: handleRollback },
        { id: "systemFolder", action: handleOpenInSystemFolder },
        { id: "deleteDirectory", action: handleDelete },
      ]}
    />
  );
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M8.10584 4.34613L8.25344 4.5H8.46667H13C13.8284 4.5 14.5 5.17157 14.5 6V12.1333C14.5 12.9529 13.932 13.5 13.3667 13.5H2.63333C2.06804 13.5 1.5 12.9529 1.5 12.1333V3.86667C1.5 3.04707 2.06804 2.5 2.63333 2.5H6.1217C6.25792 2.5 6.38824 2.55557 6.48253 2.65387L8.10584 4.34613Z"
        fill="currentColor"
        fillOpacity={0.15}
        stroke="currentColor"
      />
    </svg>
  );
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
