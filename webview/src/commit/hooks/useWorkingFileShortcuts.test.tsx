import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "../../../../package.json";
import type { WorkingTreeFile } from "../../shared/store/commit-store";
import { useWorkingFileShortcuts } from "./useWorkingFileShortcuts";

const file: WorkingTreeFile = {
  path: "src/目录/example.txt",
  staged: false,
  status: "modified",
};
const mocks = vi.hoisted(() => ({
  listeners: new Set<(event: string, data: unknown) => void>(),
  request: vi.fn(),
  state: {
    changes: [] as WorkingTreeFile[],
    highlightedFiles: new Set<string>(),
    activeTab: "commit",
    loading: false,
    showUnversioned: true,
    showDiff: vi.fn(),
    stageFile: vi.fn(),
    unstageFile: vi.fn(),
    shelveChanges: vi.fn(),
    rollbackFile: vi.fn(),
  },
}));

vi.mock("../../shared/bridge", () => ({
  bridge: {
    request: mocks.request,
    onEvent: (handler: (event: string, data: unknown) => void) => {
      mocks.listeners.add(handler);
      return () => mocks.listeners.delete(handler);
    },
  },
}));
vi.mock("../../shared/store/commit-store", () => ({
  useCommitStore: { getState: () => mocks.state },
}));

async function shortcut(action: unknown, event = "workingFileShortcut") {
  await act(async () => {
    for (const listener of mocks.listeners) listener(event, { action });
  });
}

beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  mocks.request.mockReset().mockResolvedValue({});
  for (const fn of [
    mocks.state.showDiff,
    mocks.state.stageFile,
    mocks.state.unstageFile,
    mocks.state.shelveChanges,
    mocks.state.rollbackFile,
  ])
    fn.mockReset().mockResolvedValue({});
  mocks.state.changes = [file];
  mocks.state.highlightedFiles = new Set([`${file.path}:false`]);
  mocks.state.activeTab = "commit";
  mocks.state.loading = false;
  mocks.state.showUnversioned = true;
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  expect(mocks.listeners.size).toBe(0);
});

describe("working-file native shortcuts", () => {
  it("contributes a scoped real keybinding for every working-file menu action", () => {
    const { contributes } = manifest;
    const commands = contributes.menus["webview/context"]
      .filter((entry) => entry.when.includes("webviewSection == workingFile"))
      .map((entry) => entry.command);
    expect(commands).toHaveLength(8);
    for (const command of commands) {
      expect(contributes.keybindings).toContainEqual(
        expect.objectContaining({
          command,
          key: expect.any(String),
          when: "focusedView == git-brains.commitPanel && !inputFocus",
          args: { source: "keybinding", section: "workingFile" },
        }),
      );
    }
  });

  it("opens Diff with the latest selected file and staged state", async () => {
    renderHook(useWorkingFileShortcuts);
    const selected = { ...file, path: "new:selection.txt", staged: true };
    mocks.state.changes = [file, selected];
    mocks.state.highlightedFiles = new Set([`${selected.path}:true`]);
    await shortcut("showDiff");
    expect(mocks.state.showDiff).toHaveBeenCalledWith(selected.path, true);
  });

  it.each([
    ["jumpToSource", "openFile"],
    ["systemFolder", "revealInSystemExplorer"],
  ])("routes %s to the selected path", async (action, command) => {
    renderHook(useWorkingFileShortcuts);
    await shortcut(action);
    expect(mocks.request).toHaveBeenCalledWith(command, {
      filePath: file.path,
    });
  });

  it("stages and unstages only files in the corresponding state", async () => {
    renderHook(useWorkingFileShortcuts);
    await shortcut("unstage");
    expect(mocks.state.unstageFile).not.toHaveBeenCalled();
    await shortcut("stage");
    expect(mocks.state.stageFile).toHaveBeenCalledTimes(1);
    expect(mocks.state.stageFile).toHaveBeenCalledWith(file.path);
    mocks.state.changes = [{ ...file, staged: true }];
    mocks.state.highlightedFiles = new Set([`${file.path}:true`]);
    await shortcut("stage");
    expect(mocks.state.stageFile).toHaveBeenCalledTimes(1);
    await shortcut("unstage");
    expect(mocks.state.unstageFile).toHaveBeenCalledWith(file.path);
  });

  it("uses the existing rollback flow for the selected file", async () => {
    renderHook(useWorkingFileShortcuts);
    await shortcut("rollback");
    expect(mocks.state.rollbackFile).toHaveBeenCalledWith(file.path);
  });

  it("deduplicates staged/unstaged paths when shelving or deleting a selection", async () => {
    renderHook(useWorkingFileShortcuts);
    mocks.state.changes = [
      file,
      { ...file, staged: true },
      { ...file, path: "second.txt" },
    ];
    mocks.state.highlightedFiles = new Set([
      `${file.path}:false`,
      `${file.path}:true`,
      "second.txt:false",
    ]);
    await shortcut("shelve");
    expect(mocks.state.shelveChanges).toHaveBeenCalledWith("Shelved changes", [
      file.path,
      "second.txt",
    ]);
    await shortcut("delete");
    expect(mocks.request).toHaveBeenCalledWith("deleteFiles", {
      filePaths: [file.path, "second.txt"],
    });
    await shortcut("rollback");
    expect(mocks.state.rollbackFile).not.toHaveBeenCalled();
  });

  it("ignores wrong events, unknown actions, unfocused views, other tabs and loading", async () => {
    renderHook(useWorkingFileShortcuts);
    await shortcut("invalid");
    await shortcut("delete", "nativeMenuAction");
    vi.mocked(document.hasFocus).mockReturnValue(false);
    await shortcut("delete");
    vi.mocked(document.hasFocus).mockReturnValue(true);
    mocks.state.activeTab = "shelf";
    await shortcut("delete");
    mocks.state.activeTab = "commit";
    mocks.state.loading = true;
    await shortcut("delete");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("ignores input fields, editable content and open dialogs", async () => {
    renderHook(useWorkingFileShortcuts);
    for (const tag of ["input", "textarea", "select", "div"]) {
      const input = document.createElement(tag);
      if (tag === "div") {
        input.setAttribute("contenteditable", "true");
        input.tabIndex = 0;
      }
      document.body.append(input);
      input.focus();
      await shortcut("delete");
      input.remove();
    }
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    await shortcut("delete");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("ignores empty, stale and hidden selections instead of acting on all files", async () => {
    renderHook(useWorkingFileShortcuts);
    mocks.state.highlightedFiles.clear();
    await shortcut("shelve");
    mocks.state.highlightedFiles.add("removed.txt:false");
    await shortcut("shelve");
    mocks.state.changes = [
      file,
      { ...file, path: "hidden.txt", status: "untracked" },
    ];
    mocks.state.highlightedFiles = new Set([
      `${file.path}:false`,
      "hidden.txt:false",
    ]);
    mocks.state.showUnversioned = false;
    await shortcut("shelve");
    await shortcut("delete");
    expect(mocks.state.shelveChanges).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("suppresses repeated shortcuts while a confirmation request is pending", async () => {
    let complete!: (value: unknown) => void;
    mocks.request.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    renderHook(useWorkingFileShortcuts);
    await shortcut("delete");
    await shortcut("delete");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    await act(async () => complete({ success: false }));
    await shortcut("showDiff");
    expect(mocks.state.showDiff).toHaveBeenCalledWith(file.path, false);
  });
});
