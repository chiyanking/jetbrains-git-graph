import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "../../../../package.json";
import { CommitFileContextMenu } from "../../commit/components/CommitFileContextMenu";
import { ShelfFileContextMenu } from "../../commit/components/ShelfFileContextMenu";
import { CommitContextMenu } from "../../panel/components/CommitContextMenu";
import type { WorkingTreeFile } from "../store/commit-store";
import type { Commit } from "../types/git";
import { NativeContextMenu } from "./NativeContextMenu";

const mocks = vi.hoisted(() => ({
  listeners: new Set<(event: string, data: unknown) => void>(),
  request: vi.fn(),
  progress: vi.fn(),
  commitState: {
    stageFile: vi.fn(),
    unstageFile: vi.fn(),
    rollbackFile: vi.fn(),
    showDiff: vi.fn(),
    shelveChanges: vi.fn(),
    highlightedFiles: new Set<string>(),
    changes: [] as WorkingTreeFile[],
  },
  state: {
    currentBranch: "main",
    commits: [] as Commit[],
    selectedCommitHashes: [] as string[],
    filter: { file: "" },
  },
}));
vi.mock("../bridge", () => ({
  bridge: {
    request: mocks.request,
    onEvent: (handler: (event: string, data: unknown) => void) => {
      mocks.listeners.add(handler);
      return () => mocks.listeners.delete(handler);
    },
  },
  bridgeWithProgress: mocks.progress,
}));
vi.mock("../store/panel-store", () => ({
  usePanelStore: (select: (state: typeof mocks.state) => unknown) =>
    select(mocks.state),
}));
vi.mock("../store/commit-store", () => ({
  useCommitStore: Object.assign(() => mocks.commitState, {
    getState: () => mocks.commitState,
  }),
}));

const commit: Commit = {
  hash: "123456789abcdef",
  shortHash: "12345678",
  subject: "Menu test commit",
  body: "Existing body",
  parents: ["parent"],
  refs: [],
  authorName: "Test",
  authorEmail: "test@example.com",
  authorDate: "2026-10-22",
};
let frames: Map<number, FrameRequestCallback>;
let contexts: Record<string, string | boolean>[];
let events: MouseEvent[];
function capture(event: Event) {
  const target = event.target as HTMLElement;
  if (!target.dataset.vscodeContext) return;
  contexts.push(JSON.parse(target.dataset.vscodeContext));
  events.push(event as MouseEvent);
}
async function flush() {
  await act(async () => {});
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}
async function select(action: string, menuId = contexts.at(-1)?.nativeMenuId) {
  await act(async () => {
    for (const listener of mocks.listeners) {
      listener("nativeMenuAction", { menuId, action });
    }
  });
}

beforeEach(() => {
  frames = new Map();
  contexts = [];
  events = [];
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  mocks.request.mockReset().mockResolvedValue({});
  mocks.progress.mockReset().mockResolvedValue({});
  mocks.commitState.shelveChanges.mockReset();
  mocks.state.currentBranch = "main";
  mocks.state.commits = [commit];
  mocks.state.selectedCommitHashes = [commit.hash];
  document.addEventListener("contextmenu", capture);
});
afterEach(() => {
  cleanup();
  document.removeEventListener("contextmenu", capture);
  vi.unstubAllGlobals();
  expect(mocks.listeners.size).toBe(0);
});

describe("official webview context menus", () => {
  it("cancels a pending menu when the user clicks elsewhere", async () => {
    const menu = render(
      <NativeContextMenu
        x={0}
        y={0}
        section="commit"
        ready={false}
        items={[]}
      />,
    );
    fireEvent.mouseDown(document.body);
    menu.rerender(
      <NativeContextMenu x={0} y={0} section="commit" ready items={[]} />,
    );
    await flush();
    expect(contexts).toHaveLength(0);
  });
  it("opens once under StrictMode, supplies checked/disabled context and cursor coordinates", async () => {
    render(
      <StrictMode>
        <NativeContextMenu
          x={71}
          y={92}
          section="columns"
          items={[
            { id: "columnAuthor", checked: true, action: vi.fn() },
            { id: "columnDate", disabled: true, action: vi.fn() },
          ]}
        />
      </StrictMode>,
    );
    await flush();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      webviewSection: "columns",
      preventDefaultContextMenuItems: true,
      gitBrainsChecked_columnAuthor: true,
      gitBrainsDisabled_columnDate: true,
    });
    expect([events[0].clientX, events[0].clientY]).toEqual([71, 92]);
    expect(document.querySelector("[data-vscode-context]")).toBeNull();
  });

  it("ignores foreign, disabled, unknown and duplicate selections, survives native-menu blur", async () => {
    const action = vi.fn();
    const disabled = vi.fn();
    render(
      <NativeContextMenu
        x={0}
        y={0}
        section="workingFile"
        items={[
          { id: "showDiff", action },
          { id: "delete", action: disabled, disabled: true },
        ]}
      />,
    );
    await flush();
    await select("showDiff", "another-webview");
    await select("delete");
    await select("unrecognized");
    expect(action).not.toHaveBeenCalled();
    expect(disabled).not.toHaveBeenCalled();
    fireEvent(window, new Event("blur"));
    await select("showDiff");
    await select("showDiff");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("reopens at the same position and invalidates the previous request", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const menu = render(
      <NativeContextMenu
        key="first"
        x={7}
        y={9}
        section="branch"
        items={[{ id: "checkoutBranch", action: first }]}
      />,
    );
    await flush();
    const firstId = contexts[0].nativeMenuId;
    menu.rerender(
      <NativeContextMenu
        key="second"
        x={7}
        y={9}
        section="branch"
        items={[{ id: "checkoutBranch", action: second }]}
      />,
    );
    await flush();
    expect(contexts).toHaveLength(2);
    expect(contexts[1].nativeMenuId).not.toBe(firstId);
    await select("checkoutBranch", firstId);
    await select("checkoutBranch");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not let a slow repository query reopen an older menu", async () => {
    const first = render(
      <NativeContextMenu
        x={0}
        y={0}
        section="commit"
        ready={false}
        items={[]}
      />,
    );
    render(
      <NativeContextMenu
        x={2}
        y={2}
        section="logFile"
        items={[{ id: "copyPath", action: vi.fn() }]}
      />,
    );
    await flush();
    first.rerender(
      <NativeContextMenu x={0} y={0} section="commit" ready items={[]} />,
    );
    await flush();
    expect(contexts.map((context) => context.webviewSection)).toEqual([
      "logFile",
    ]);
  });

  it("keeps Reset actions at the top level with separators, scoping and column checkmarks", () => {
    const { contributes } = manifest;
    const menu = contributes.menus["webview/context"];
    expect(menu.some((entry: { submenu?: string }) => entry.submenu)).toBe(
      false,
    );
    const reset = menu.filter((entry: { command: string }) =>
      entry.command.startsWith("git-brains.context.reset"),
    );
    expect(reset.map((entry) => entry.command)).toEqual([
      "git-brains.context.resetMixed",
      "git-brains.context.resetSoft",
      "git-brains.context.resetHard",
    ]);
    const resetGroup = reset[0].group.split("@")[0];
    for (const entry of reset) {
      expect(entry.when).toContain("webviewId == git-brains.gitLog");
      expect(entry.when).toContain("webviewSection == commit");
      expect(entry.group.split("@")[0]).toBe(resetGroup);
    }
    for (const action of ["editMessage", "checkoutRevision"]) {
      const entry = menu.find(
        (entry) => entry.command === `git-brains.context.${action}`,
      );
      expect(entry.group.split("@")[0]).not.toBe(resetGroup);
    }
    expect(
      contributes.commands
        .filter((command) =>
          command.command.startsWith("git-brains.context.reset"),
        )
        .map((command) => command.title),
    ).toEqual([
      "Reset to Here (Mixed)",
      "Reset to Here (Soft)",
      "Reset to Here (Hard)",
    ]);
    for (const [action, key] of [
      ["resetMixed", "m"],
      ["resetSoft", "s"],
      ["resetHard", "h"],
    ]) {
      expect(contributes.keybindings).toContainEqual({
        command: `git-brains.context.${action}`,
        key: `ctrl+alt+shift+${key}`,
        mac: `cmd+alt+shift+${key}`,
        when: "focusedView == git-brains.gitLog && !inputFocus",
        args: { source: "keybinding" },
      });
    }
    for (const command of contributes.commands.filter(
      (command: { command: string }) =>
        command.command.startsWith("git-brains.context."),
    )) {
      expect(contributes.menus.commandPalette).toContainEqual({
        command: command.command,
        when: "false",
      });
      const action = command.command.split(".").at(-1);
      expect(command.enablement).toBe(`!gitBrainsDisabled_${action}`);
      if (action.startsWith("column"))
        expect(command.toggled).toBe(`gitBrainsChecked_${action}`);
    }
  });
});

describe("file menu action context", () => {
  it("preserves and deduplicates a working-tree multi-file selection when shelving", async () => {
    const file: WorkingTreeFile = {
      path: "src/a.ts",
      staged: false,
      status: "modified",
    };
    mocks.commitState.changes = [
      file,
      { ...file, staged: true },
      { ...file, path: "src/b.ts" },
    ];
    mocks.commitState.highlightedFiles = new Set([
      "src/a.ts:false",
      "src/a.ts:true",
      "src/b.ts:false",
    ]);
    render(<CommitFileContextMenu x={0} y={0} file={file} onClose={vi.fn()} />);
    await flush();
    expect(contexts[0]).toMatchObject({ gitBrainsMenu_stage: true });
    expect(contexts[0].gitBrainsMenu_unstage).toBeUndefined();
    await select("shelve");
    expect(mocks.commitState.shelveChanges).toHaveBeenCalledWith(
      "Shelved changes",
      ["src/a.ts", "src/b.ts"],
    );
  });

  it("routes shelf file operations to the clicked stash and path", async () => {
    render(
      <ShelfFileContextMenu
        x={0}
        y={0}
        stashId="stash@{2}"
        filePath="目录/example.txt"
        onClose={vi.fn()}
      />,
    );
    await flush();
    await select("unshelveFile");
    expect(mocks.request).toHaveBeenCalledWith("unshelveFile", {
      stashId: "stash@{2}",
      filePath: "目录/example.txt",
    });
  });
});

describe("commit menu actions", () => {
  it.each([
    "mixed",
    "soft",
  ])("routes Reset %s with the selected hash", async (mode) => {
    render(<CommitContextMenu x={1} y={2} commit={commit} onClose={vi.fn()} />);
    await flush();
    await select(mode === "mixed" ? "resetMixed" : "resetSoft");
    expect(mocks.progress).toHaveBeenCalledWith("resetToCommit", {
      hash: commit.hash,
      mode,
    });
  });

  it.each([
    false,
    true,
  ])("keeps Hard Reset confirmation (confirmed=%s)", async (confirmed) => {
    mocks.request.mockImplementation(async (command: string) =>
      command === "showConfirmMessage" ? { confirmed } : {},
    );
    render(<CommitContextMenu x={1} y={2} commit={commit} onClose={vi.fn()} />);
    await flush();
    await select("resetHard");
    expect(mocks.request).toHaveBeenCalledWith(
      "showConfirmMessage",
      expect.objectContaining({
        message: expect.stringContaining(commit.shortHash),
        confirmLabel: "Reset",
      }),
    );
    if (confirmed)
      expect(mocks.progress).toHaveBeenCalledWith("resetToCommit", {
        hash: commit.hash,
        mode: "hard",
      });
    else expect(mocks.progress).not.toHaveBeenCalled();
  });

  it("waits for repository state and disables history edits during a rebase", async () => {
    let resolveState!: (value: unknown) => void;
    mocks.request.mockImplementation((command: string) =>
      command === "getRebaseState"
        ? new Promise((resolve) => {
            resolveState = resolve;
          })
        : Promise.resolve({}),
    );
    render(<CommitContextMenu x={1} y={2} commit={commit} onClose={vi.fn()} />);
    await flush();
    expect(contexts).toHaveLength(0);
    await act(async () => resolveState({ isRebasing: true }));
    await flush();
    expect(contexts[0]).toMatchObject({
      gitBrainsDisabled_dropCommit: true,
      gitBrainsDisabled_editMessage: true,
      gitBrainsDisabled_squash: true,
    });
    await select("dropCommit");
    expect(mocks.request).not.toHaveBeenCalledWith(
      "showConfirmMessage",
      expect.anything(),
    );
  });

  it("keeps the edit-message dialog alive after native menu selection", async () => {
    const onClose = vi.fn();
    render(<CommitContextMenu x={1} y={2} commit={commit} onClose={onClose} />);
    await flush();
    await select("editMessage");
    expect(screen.getByRole("textbox")).toHaveProperty(
      "value",
      `${commit.subject}\n\n${commit.body}`,
    );
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Updated message" },
    });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await act(async () => {});
    expect(mocks.progress).toHaveBeenCalledWith("editCommitMessage", {
      hash: commit.hash,
      message: "Updated message",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
