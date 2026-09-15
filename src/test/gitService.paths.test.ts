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
 * Non-ASCII path regression tests.
 *
 * Git defaults to core.quotepath=true, which C-style quotes non-ASCII paths
 * as octal escapes ("\345\204\277\345\255\220.txt") under LC_ALL=C. The
 * extension must show raw UTF-8 paths regardless of the user's global or
 * repository git config, so the repo below force-enables quoting to prove
 * the service disables it itself.
 */
async function initQuotingRepo(): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gg-quotepath-"));
  const run = (args: string[]) =>
    execFileAsync("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  await run(["init", "-q"]);
  await run(["config", "user.email", "test@example.com"]);
  await run(["config", "user.name", "tester"]);
  // Adversarial repo config: force the quoting git defaults to.
  await run(["config", "core.quotepath", "true"]);
  return cwd;
}

test("getCommitFiles returns raw UTF-8 paths for non-ASCII filenames", async (t) => {
  const cwd = await initQuotingRepo();
  t.after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  await fs.writeFile(path.join(cwd, "儿子.txt"), "内容\n", "utf-8");
  await execFileAsync("git", ["add", "."], { cwd });
  await execFileAsync("git", ["commit", "-qm", "add chinese name"], { cwd });
  const hash = (
    await execFileAsync("git", ["rev-parse", "HEAD"], { cwd })
  ).stdout.trim();

  const service = new GitService(cwd);
  const files = await service.getCommitFiles(hash);

  assert.strictEqual(files.length, 1);
  assert.strictEqual(files[0].newPath, "儿子.txt");
  assert.strictEqual(files[0].oldPath, "儿子.txt");
});

test("getCommitFiles returns raw UTF-8 paths for renames (-M)", async (t) => {
  const cwd = await initQuotingRepo();
  t.after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  await fs.writeFile(path.join(cwd, "old.txt"), "a\n", "utf-8");
  await execFileAsync("git", ["add", "."], { cwd });
  await execFileAsync("git", ["commit", "-qm", "init"], { cwd });
  await execFileAsync("git", ["mv", "old.txt", "重命名.txt"], { cwd });
  await execFileAsync("git", ["commit", "-qm", "rename"], { cwd });
  const hash = (
    await execFileAsync("git", ["rev-parse", "HEAD"], { cwd })
  ).stdout.trim();

  const service = new GitService(cwd);
  const files = await service.getCommitFiles(hash);

  assert.strictEqual(files.length, 1);
  assert.strictEqual(files[0].status, "renamed");
  assert.strictEqual(files[0].oldPath, "old.txt");
  assert.strictEqual(files[0].newPath, "重命名.txt");
});

test("getStatus returns raw UTF-8 paths for non-ASCII filenames", async (t) => {
  const cwd = await initQuotingRepo();
  t.after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  await fs.writeFile(path.join(cwd, "新文件.txt"), "内容\n", "utf-8");

  const service = new GitService(cwd);
  const status = await service.getStatus();

  assert.strictEqual(status.length, 1);
  assert.strictEqual(status[0].path, "新文件.txt");
});

test("getConflictFiles returns raw UTF-8 paths for non-ASCII filenames", async (t) => {
  const cwd = await initQuotingRepo();
  t.after(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  const run = (args: string[]) => execFileAsync("git", args, { cwd });
  await fs.writeFile(path.join(cwd, "冲突.txt"), "base\n", "utf-8");
  await run(["add", "."]);
  await run(["commit", "-qm", "init"]);
  await run(["checkout", "-qb", "side"]);
  await fs.writeFile(path.join(cwd, "冲突.txt"), "theirs\n", "utf-8");
  await run(["commit", "-qam", "side change"]);
  await run(["checkout", "-q", "master"]);
  await fs.writeFile(path.join(cwd, "冲突.txt"), "ours\n", "utf-8");
  await run(["commit", "-qam", "main change"]);
  await run(["merge", "side"]).catch(() => {}); // conflict expected

  const service = new GitService(cwd);
  const files = await service.getConflictFiles();

  assert.ok(files.includes("冲突.txt"), `expected raw path, got: ${files}`);
});
