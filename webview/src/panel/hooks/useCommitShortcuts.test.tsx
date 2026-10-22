import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Commit } from "../../shared/types/git";
import { useCommitShortcuts } from "./useCommitShortcuts";

const commit: Commit = {
  hash: "123456789abcdef",
  shortHash: "12345678",
  subject: "Selected commit",
  body: "",
  parents: ["parent"],
  refs: [],
  authorName: "Test",
  authorEmail: "test@example.com",
  authorDate: "2026-10-22",
};

const mocks = vi.hoisted(() => ({
  listeners: new Set<(event: string, data: unknown) => void>(),
  request: vi.fn(),
  progress: vi.fn(),
  state: {
    visibleCommits: [] as Commit[],
    selectedCommitHashes: [] as string[],
    currentBranch: "main",
    loading: false,
    operationInProgress: false,
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
  bridgeWithProgress: mocks.progress,
}));
vi.mock("../../shared/store/panel-store", () => ({
  usePanelStore: { getState: () => mocks.state },
}));

async function shortcut(value: unknown, event = "commitResetShortcut") {
  await act(async () => {
    for (const listener of mocks.listeners)
      listener(
        event,
        event === "commitShortcut" ? { action: value } : { mode: value },
      );
  });
}

beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  mocks.request.mockReset().mockResolvedValue({ confirmed: true });
  mocks.progress.mockReset().mockResolvedValue({});
  mocks.state.visibleCommits = [commit];
  mocks.state.selectedCommitHashes = [commit.hash];
  mocks.state.currentBranch = "main";
  mocks.state.loading = false;
  mocks.state.operationInProgress = false;
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  expect(mocks.listeners.size).toBe(0);
});

describe("Git Log Reset shortcuts", () => {
  it.each([
    "mixed",
    "soft",
  ])("resets the current single selection in %s mode", async (mode) => {
    renderHook(useCommitShortcuts);
    const newer = { ...commit, hash: "new-selection" };
    mocks.state.visibleCommits = [commit, newer];
    mocks.state.selectedCommitHashes = [newer.hash];
    await shortcut(mode);
    expect(mocks.progress).toHaveBeenCalledWith("resetToCommit", {
      hash: newer.hash,
      mode,
    });
  });

  it.each([
    false,
    true,
  ])("requires Hard Reset confirmation (confirmed=%s)", async (confirmed) => {
    mocks.request.mockResolvedValue({ confirmed });
    renderHook(useCommitShortcuts);
    await shortcut("hard");
    expect(mocks.request).toHaveBeenCalledWith("showConfirmMessage", {
      message: expect.stringContaining("'main' to 12345678 (hard)"),
      confirmLabel: "Reset",
    });
    expect(mocks.progress).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    if (confirmed)
      expect(mocks.progress).toHaveBeenCalledWith("resetToCommit", {
        hash: commit.hash,
        mode: "hard",
      });
  });

  it("ignores shortcuts when this webview is unfocused or the selection is ambiguous or hidden", async () => {
    renderHook(useCommitShortcuts);
    vi.mocked(document.hasFocus).mockReturnValue(false);
    await shortcut("mixed");
    vi.mocked(document.hasFocus).mockReturnValue(true);
    mocks.state.selectedCommitHashes = [];
    await shortcut("mixed");
    mocks.state.selectedCommitHashes = [commit.hash, "another"];
    await shortcut("mixed");
    mocks.state.selectedCommitHashes = ["filtered-out"];
    await shortcut("mixed");
    expect(mocks.progress).not.toHaveBeenCalled();
  });

  it("does not reset while typing or using a dialog", async () => {
    renderHook(useCommitShortcuts);
    for (const tag of ["input", "textarea", "select", "div"]) {
      const input = document.createElement(tag);
      if (tag === "div") {
        input.contentEditable = "true";
        input.setAttribute("contenteditable", "true");
        input.tabIndex = 0;
      }
      document.body.append(input);
      input.focus();
      await shortcut("mixed");
      input.remove();
    }
    for (const attribute of ["dialog", "edit-message"]) {
      const dialog = document.createElement("div");
      if (attribute === "dialog") dialog.setAttribute("role", "dialog");
      else dialog.className = "squash-message-modal";
      document.body.append(dialog);
      await shortcut("hard");
      dialog.remove();
    }
    expect(mocks.progress).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("ignores invalid events and operations already in progress", async () => {
    renderHook(useCommitShortcuts);
    await shortcut("invalid");
    await shortcut("mixed", "nativeMenuAction");
    mocks.state.loading = true;
    await shortcut("mixed");
    mocks.state.loading = false;
    mocks.state.operationInProgress = true;
    await shortcut("mixed");
    expect(mocks.progress).not.toHaveBeenCalled();
  });

  it("ignores repeated shortcuts while confirmation is pending and unlocks on cancel", async () => {
    let resolveConfirmation!: (value: { confirmed: boolean }) => void;
    mocks.request.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConfirmation = resolve;
        }),
    );
    renderHook(useCommitShortcuts);
    await shortcut("hard");
    await shortcut("hard");
    await shortcut("soft");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.progress).not.toHaveBeenCalled();
    await act(async () => resolveConfirmation({ confirmed: false }));
    await shortcut("soft");
    expect(mocks.progress).toHaveBeenCalledWith("resetToCommit", {
      hash: commit.hash,
      mode: "soft",
    });
  });
});

describe("Git Log action shortcuts", () => {
  it.each([
    "copyHash",
    "cherryPick",
    "editMessage",
    "checkoutRevision",
    "revertCommit",
    "newBranch",
    "newTag",
  ])("opens the existing %s action for the latest selection", async (action) => {
    const { result } = renderHook(useCommitShortcuts);
    const newer = { ...commit, hash: "new-selection" };
    mocks.state.visibleCommits = [commit, newer];
    mocks.state.selectedCommitHashes = [newer.hash];
    await shortcut(action, "commitShortcut");
    expect(result.current.request).toEqual({
      id: expect.any(String),
      action,
      commit: newer,
    });
  });

  it("ignores invalid actions, inputs, dialogs, unfocused, busy or ambiguous selections", async () => {
    const { result } = renderHook(useCommitShortcuts);
    await shortcut("delete", "commitShortcut");
    vi.mocked(document.hasFocus).mockReturnValue(false);
    await shortcut("copyHash", "commitShortcut");
    vi.mocked(document.hasFocus).mockReturnValue(true);
    const input = document.createElement("textarea");
    document.body.append(input);
    input.focus();
    await shortcut("copyHash", "commitShortcut");
    input.remove();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    await shortcut("newBranch", "commitShortcut");
    dialog.remove();
    mocks.state.loading = true;
    await shortcut("cherryPick", "commitShortcut");
    mocks.state.loading = false;
    mocks.state.operationInProgress = true;
    await shortcut("cherryPick", "commitShortcut");
    mocks.state.operationInProgress = false;
    for (const selection of [[], [commit.hash, "another"], ["filtered-out"]]) {
      mocks.state.selectedCommitHashes = selection;
      await shortcut("copyHash", "commitShortcut");
    }
    expect(result.current.request).toBeNull();
  });

  it.each([
    "closed",
    "settled",
  ] as const)("blocks other actions and Reset until both phases finish (%s first)", async (first) => {
    const { result } = renderHook(useCommitShortcuts);
    await shortcut("editMessage", "commitShortcut");
    const request = result.current.request;
    if (!request) throw new Error("Expected an active shortcut request");
    await shortcut("newTag", "commitShortcut");
    await shortcut("mixed");
    expect(result.current.request).toBe(request);
    expect(mocks.progress).not.toHaveBeenCalled();
    act(() => result.current.finish(request.id, first));
    await shortcut("newTag", "commitShortcut");
    expect(result.current.request?.action).not.toBe("newTag");
    act(() =>
      result.current.finish(
        request.id,
        first === "closed" ? "settled" : "closed",
      ),
    );
    await shortcut("newTag", "commitShortcut");
    expect(result.current.request?.action).toBe("newTag");
    act(() => result.current.finish(request.id, "closed"));
    expect(result.current.request?.action).toBe("newTag");
  });

  it("blocks commit actions while Hard Reset confirmation is pending", async () => {
    mocks.request.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(useCommitShortcuts);
    await shortcut("hard");
    await shortcut("copyHash", "commitShortcut");
    expect(result.current.request).toBeNull();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});
