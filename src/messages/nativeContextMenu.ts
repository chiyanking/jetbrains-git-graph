import * as vscode from "vscode";
import type { MessageRouter } from "./messageRouter";
import type {
  CommitResetShortcutEvent,
  CommitShortcutEvent,
  WorkingFileShortcutEvent,
} from "./protocol";

const commandPrefix = "git-brains.context.";
const resetModes: Record<string, CommitResetShortcutEvent["mode"]> = {
  resetMixed: "mixed",
  resetSoft: "soft",
  resetHard: "hard",
};
const commitActions = new Set<CommitShortcutEvent["action"]>([
  "copyHash",
  "cherryPick",
  "editMessage",
  "checkoutRevision",
  "revertCommit",
  "newBranch",
  "newTag",
]);
const workingFileActions = new Set<WorkingFileShortcutEvent["action"]>([
  "showDiff",
  "jumpToSource",
  "systemFolder",
  "stage",
  "unstage",
  "shelve",
  "rollback",
  "delete",
]);

/** Route a native menu selection back to the webview that opened it. */
export function registerNativeContextMenuCommands(
  context: vscode.ExtensionContext,
  router: MessageRouter,
): void {
  const commands = context.extension.packageJSON.contributes.commands as {
    command: string;
  }[];
  for (const { command } of commands) {
    if (!command.startsWith(commandPrefix)) continue;
    const action = command.slice(commandPrefix.length);
    context.subscriptions.push(
      vscode.commands.registerCommand(command, (data: unknown) => {
        if (!data || typeof data !== "object") return;
        const menu = data as Record<string, unknown>;
        if (menu.source === "keybinding" && resetModes[action]) {
          router.broadcastEvent("commitResetShortcut", {
            mode: resetModes[action],
          });
          return;
        }
        if (
          menu.source === "keybinding" &&
          menu.section === "commit" &&
          commitActions.has(action as CommitShortcutEvent["action"])
        ) {
          router.broadcastEvent("commitShortcut", { action });
          return;
        }
        if (
          menu.source === "keybinding" &&
          menu.section === "workingFile" &&
          workingFileActions.has(action as WorkingFileShortcutEvent["action"])
        ) {
          router.broadcastEvent("workingFileShortcut", { action });
          return;
        }
        if (
          typeof menu.nativeMenuId !== "string" ||
          menu[`gitBrainsMenu_${action}`] !== true ||
          menu[`gitBrainsDisabled_${action}`] === true
        )
          return;
        router.broadcastEvent("nativeMenuAction", {
          menuId: menu.nativeMenuId,
          action,
        });
      }),
    );
  }
}
