import assert from "node:assert";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { GitService } from "../git/gitService";

const execFileAsync = promisify(execFile);

/**
 * Shelve regression tests.
 *
 * shelveChanges(message, filePaths) must work on git < 2.35 (the previous
 * implementation used `git stash push --staged`, which errors out on older
 * git after already having run `git reset HEAD`, leaving the user's staging
 * state lost). The pathspec form `git stash push -u -- <files>` is supported
 * since git 2.13 and leaves unrelated files' staging untouched.
 */
async function initRepo(): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gg-shelve-"));
  const run = (args: string[]) =>
    execFileAsync("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  await run(["init", "-q"]);
  await run(["config", "user.email", "test@example.com"]);
  await run(["config", "user.name", "tester"]);
  await fs.writeFile(path.join(cwd, "f1.txt"), "a\n", "utf-8");
  await fs.writeFile(path.join(cwd, "f2.txt"), "b\n", "utf-8");
  await run(["add", "."]);
  await run(["commit", "-qm", "init"]);
  return cwd;
}

test("shelveChanges with selected files works on old git and preserves other staged files", async (t) => {
  const cwd = await initRepo();
  const run = (args: string[]) => execFileAsync("git", args, { cwd });
  t.after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  // f1: unstaged change. f2: staged change. untracked.txt: new file.
  await fs.writeFile(path.join(cwd, "f1.txt"), "a\nchanged1\n", "utf-8");
  await fs.writeFile(path.join(cwd, "f2.txt"), "b\nchanged2\n", "utf-8");
  await run(["add", "f2.txt"]);
  await fs.writeFile(path.join(cwd, "untracked.txt"), "new\n", "utf-8");

  const service = new GitService(cwd);
  await service.shelveChanges("test-shelve", ["f1.txt", "untracked.txt"]);

  // Selected tracked file is restored to HEAD
  assert.strictEqual(
    await fs.readFile(path.join(cwd, "f1.txt"), "utf-8"),
    "a\n",
  );
  // Selected untracked file is removed from disk
  await assert.rejects(fs.access(path.join(cwd, "untracked.txt")));
  // Unrelated file keeps its staged state
  const status = await service.getStatus();
  const f2 = status.find((s) => s.path === "f2.txt");
  assert.ok(f2, "f2.txt should be in status");
  assert.strictEqual(f2.indexStatus, "M", "f2.txt should still be staged");
  assert.strictEqual(f2.workTreeStatus, " ", "f2.txt worktree should be clean");

  // The stash contains the shelved changes
  const stashList = (await run(["stash", "list"])).stdout;
  assert.ok(stashList.includes("test-shelve"), `stash created: ${stashList}`);

  // Unshelving restores both files
  await service.unshelveChanges("stash@{0}");
  assert.strictEqual(
    await fs.readFile(path.join(cwd, "f1.txt"), "utf-8"),
    "a\nchanged1\n",
  );
  assert.strictEqual(
    await fs.readFile(path.join(cwd, "untracked.txt"), "utf-8"),
    "new\n",
  );
});

test("shelveChanges with no matching changes throws a clear error", async (t) => {
  const cwd = await initRepo();
  t.after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  const service = new GitService(cwd);
  await assert.rejects(
    service.shelveChanges("test-shelve", ["f1.txt"]),
    /No changes to shelve/,
  );
  // No stash should have been created
  const stashList = (await execFileAsync("git", ["stash", "list"], { cwd }))
    .stdout;
  assert.strictEqual(stashList.trim(), "");
});
