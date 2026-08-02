import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve('vanilla-cookieconsent/package.json')), 'dist', 'cookieconsent.css');

if (!existsSync(src)) {
  console.error(`[consent-gate] cannot find CookieConsent stylesheet at ${src}`);
  process.exit(1);
}

mkdirSync('dist', { recursive: true });
copyFileSync(src, join('dist', 'styles.css'));
console.log('[consent-gate] dist/styles.css <- vanilla-cookieconsent (MIT, Orest Bida)');
