import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitShortcutEvent } from "../../shared/bridge/types";
import type { Commit } from "../../shared/types/git";
import { CommitContextMenu } from "./CommitContextMenu";

const commit: Commit = {
  hash: "123456789abcdef",
  shortHash: "12345678",
  subject: "Selected commit",
  body: "Original body",
  parents: ["parent"],
  refs: [],
  authorName: "Test",
  authorEmail: "test@example.com",
  authorDate: "2026-10-22",
};

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  progress: vi.fn(),
  nativeMenu: vi.fn(),
  state: {
    currentBranch: "main",
    commits: [] as Commit[],
    selectedCommitHashes: [] as string[],
    filter: { file: "" },
    selectCommit: vi.fn(),
  },
}));

vi.mock("../../shared/bridge", () => ({
  bridge: { request: mocks.request },
  bridgeWithProgress: mocks.progress,
}));
vi.mock("../../shared/store/panel-store", () => ({
  usePanelStore: (selector: (state: typeof mocks.state) => unknown) =>
    selector(mocks.state),
}));
vi.mock("../../shared/components/NativeContextMenu", () => ({
  NativeContextMenu: (props: unknown) => {
    mocks.nativeMenu(props);
    return null;
  },
}));

beforeEach(() => {
  mocks.request.mockReset().mockImplementation(async (command: string) => {
    if (command === "getRebaseState") return { isRebasing: false };
    if (command === "getMergeState") return { isMerging: false };
    if (command === "getCherryPickState") return { isCherryPicking: false };
    if (command === "showInputBox") return { value: "new-tag" };
    return {};
  });
  mocks.progress.mockReset().mockResolvedValue({});
  mocks.nativeMenu.mockReset();
  mocks.state.currentBranch = "main";
  mocks.state.commits = [commit];
  mocks.state.selectedCommitHashes = [commit.hash];
});
afterEach(cleanup);

function runShortcut(action: CommitShortcutEvent["action"]) {
  const close = vi.fn();
  const settled = vi.fn();
  const createBranch = vi.fn();
  render(
    <CommitContextMenu
      x={0}
      y={0}
      commit={commit}
      onClose={close}
      onCreateBranch={createBranch}
      shortcut={{ action, onSettled: settled }}
    />,
  );
  return { close, settled, createBranch };
}

describe("Commit menu shortcut execution", () => {
  it.each([
    ["copyHash", "copyToClipboard", { text: commit.hash }],
    ["cherryPick", "cherryPick", { hash: commit.hash }],
    ["checkoutRevision", "checkoutCommit", { hash: commit.hash }],
    ["revertCommit", "revertCommit", { hash: commit.hash }],
  ] as const)("reuses the %s handler without opening a native menu", async (action, command, params) => {
    const { close, settled } = runShortcut(action);
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(
      action === "copyHash" ? mocks.request : mocks.progress,
    ).toHaveBeenCalledWith(command, params);
    expect(close).toHaveBeenCalledTimes(1);
    expect(mocks.nativeMenu).not.toHaveBeenCalled();
  });

  it("uses the existing branch dialog callback", async () => {
    const { createBranch, settled } = runShortcut("newBranch");
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(createBranch).toHaveBeenCalledWith(commit.hash, "");
    expect(mocks.request).not.toHaveBeenCalledWith(
      "showInputBox",
      expect.anything(),
    );
  });

  it("prompts for a tag and uses the captured commit", async () => {
    const { settled } = runShortcut("newTag");
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenCalledWith("createTag", {
      tagName: "new-tag",
      hash: commit.hash,
    });
  });

  it("retains the edit dialog, validation and save flow", async () => {
    const { close, settled } = runShortcut("editMessage");
    const editor = await screen.findByRole("textbox");
    expect((editor as HTMLTextAreaElement).value).toBe(
      "Selected commit\n\nOriginal body",
    );
    expect(close).not.toHaveBeenCalled();
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    fireEvent.change(editor, { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByText("Commit message cannot be empty")).toBeTruthy();
    expect(mocks.progress).not.toHaveBeenCalled();
    fireEvent.change(editor, { target: { value: "Updated message" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mocks.progress).toHaveBeenCalledWith("editCommitMessage", {
      hash: commit.hash,
      message: "Updated message",
    });
  });

  it.each([
    "detached",
    "rebase",
    "merge",
    "cherry-pick",
    "unknown",
    "multi-selection",
  ])("keeps editing disabled during %s", async (state) => {
    if (state === "detached") mocks.state.currentBranch = "";
    if (state === "multi-selection") {
      const other = { ...commit, hash: "other" };
      mocks.state.commits = [commit, other];
      mocks.state.selectedCommitHashes = [commit.hash, other.hash];
    }
    if (["rebase", "merge", "cherry-pick", "unknown"].includes(state)) {
      mocks.request.mockImplementation(async () => {
        if (state === "unknown") throw new Error("Repository unavailable");
        return {
          isRebasing: state === "rebase",
          isMerging: state === "merge",
          isCherryPicking: state === "cherry-pick",
        };
      });
    }
    const { close, settled } = runShortcut("editMessage");
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(mocks.progress).not.toHaveBeenCalled();
  });

  it("waits for an asynchronous command after its menu closes", async () => {
    let resolve!: (value: unknown) => void;
    mocks.progress.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { close, settled } = runShortcut("cherryPick");
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(settled).not.toHaveBeenCalled();
    await act(async () => resolve({}));
    expect(settled).toHaveBeenCalledTimes(1);
  });
});
