// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('node:fs', () => ({ readFileSync: vi.fn(), mkdirSync: vi.fn(), rmSync: vi.fn() }));
let dirty: boolean;
let pushed: boolean;
let tagged: boolean;
let failBuild: boolean;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  dirty = false; pushed = true; tagged = false; failBuild = false;
  vi.mocked(readFileSync).mockReturnValue('{"version":"1.2.0"}');
  vi.mocked(execFileSync).mockImplementation(((command: string, args: string[]) => {
    if (command === 'npm' && failBuild) throw new Error('Tests failed');
    const calls: Record<string, string> = {
      'git status --porcelain': dirty ? ' M src/ui.ts' : '',
      'git symbolic-ref --short HEAD': 'main',
      'git rev-parse HEAD': 'abc123',
      'git ls-remote origin refs/heads/main': pushed ? 'abc123\trefs/heads/main' : '',
      'git ls-remote origin refs/tags/v1.2.0': tagged ? 'old123\trefs/tags/v1.2.0' : '',
      'git remote get-url origin': 'git@github.com:example/extension.git',
      'gh repo view git@github.com:example/extension.git --json nameWithOwner --jq .nameWithOwner': 'example/extension',
    };
    return calls[[command, ...args].join(' ')] ?? '';
  }) as typeof execFileSync);
});
const release = () => import('../scripts/release');
const published = () => vi.mocked(execFileSync).mock.calls.some(([cmd, args]) => cmd === 'gh' && args?.[0] === 'release');

it('builds and packages dist before publishing the exact pushed commit to origin', async () => {
  await release();
  expect(mkdirSync).toHaveBeenCalled();
  expect(rmSync).toHaveBeenCalledWith(expect.stringMatching(/releases\/unsubscribe-extension-1\.2\.0\.zip$/), { force: true });
  const calls = vi.mocked(execFileSync).mock.calls;
  expect(calls.slice(-3).map(([cmd]) => cmd)).toEqual(['npm', 'zip', 'gh']);
  expect(calls.at(-2)).toEqual(['zip', ['-r', expect.stringMatching(/unsubscribe-extension-1\.2\.0\.zip$/), '.'], expect.objectContaining({ cwd: expect.stringMatching(/dist\/$/) })]);
  expect(calls.at(-1)?.[1]).toEqual(['release', 'create', 'v1.2.0', expect.any(String), '--repo', 'example/extension', '--target', 'abc123', '--title', 'Unsubscribe Collector v1.2.0', '--generate-notes']);
});
it('rejects mismatched versions', async () => {
  vi.mocked(readFileSync).mockReturnValueOnce('{"version":"1.3.0"}');
  await expect(release()).rejects.toThrow('versions must match');
  expect(published()).toBe(false);
});
it('rejects uncommitted changes', async () => {
  dirty = true;
  await expect(release()).rejects.toThrow('Commit your changes');
  expect(published()).toBe(false);
});
it('rejects commits not pushed to origin', async () => {
  pushed = false;
  await expect(release()).rejects.toThrow('Push this branch');
  expect(published()).toBe(false);
});
it('rejects an existing version tag', async () => {
  tagged = true;
  await expect(release()).rejects.toThrow('already exists');
  expect(published()).toBe(false);
});
it('does not package or publish when checks fail', async () => {
  failBuild = true;
  await expect(release()).rejects.toThrow('Tests failed');
  expect(mkdirSync).not.toHaveBeenCalled();
  expect(published()).toBe(false);
});
