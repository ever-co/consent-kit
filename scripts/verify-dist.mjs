/**
 * Post-build smoke test: the published entry points must actually resolve and
 * export what package.json claims, in both ESM and CJS.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const failures = [];

const expectExports = (label, mod, names) => {
  for (const name of names) {
    if (typeof mod[name] === 'undefined') failures.push(`${label} is missing export "${name}"`);
  }
};

const CORE = ['initConsent', 'createConsent', 'getConsent', 'CONSENT_CATEGORIES', 'IUBENDA_CONSENT_EVENT'];

expectExports('dist/index.js (esm)', await import(pathToFileURL(resolve('dist/index.js')).href), CORE);
expectExports('dist/index.cjs (cjs)', require(resolve('dist/index.cjs')), CORE);
expectExports('dist/testing.js (esm)', await import(pathToFileURL(resolve('dist/testing.js')).href), ['createMemoryUi']);
expectExports('dist/testing.cjs (cjs)', require(resolve('dist/testing.cjs')), ['createMemoryUi']);

for (const file of ['dist/index.d.ts', 'dist/react/index.d.ts', 'dist/testing.d.ts', 'dist/styles.css']) {
  if (!existsSync(file)) failures.push(`missing ${file}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`[consent-gate] ${failure}`);
  process.exit(1);
}
console.log('[consent-gate] dist verified: ESM + CJS entries resolve, types and stylesheet present.');
