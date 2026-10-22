import { bridge, bridgeWithProgress } from "../../shared/bridge";
import type { CommitResetShortcutEvent } from "../../shared/bridge/types";
import type { Commit } from "../../shared/types/git";

/** Use the same target, parameters and confirmation for menus and shortcuts. */
export async function resetCommit(
  commit: Commit,
  currentBranch: string,
  mode: CommitResetShortcutEvent["mode"],
): Promise<void> {
  try {
    if (mode === "hard") {
      const shortHash = commit.shortHash || commit.hash.slice(0, 8);
      const result = (await bridge.request("showConfirmMessage", {
        message: `Reset '${currentBranch}' to ${shortHash} (hard)? This will discard all uncommitted changes.`,
        confirmLabel: "Reset",
      })) as { confirmed: boolean };
      if (!result.confirmed) return;
    }
    await bridgeWithProgress("resetToCommit", { hash: commit.hash, mode });
  } catch (err) {
    console.error("Reset failed:", err);
  }
}
