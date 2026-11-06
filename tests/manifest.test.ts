import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('grants only local storage and exactly the requested Fastmail origin', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(['storage']);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.optional_host_permissions).toBeUndefined();
  expect(manifest.content_scripts).toEqual([{
    matches: ['https://app.fastmail.com/*'], js: ['content.js'], run_at: 'document_idle',
  }]);
  expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
  expect(manifest.action.default_popup).toBe('index.html');
});
