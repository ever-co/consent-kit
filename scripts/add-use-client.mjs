/**
 * Next.js App Router needs a `"use client"` directive at the top of the React
 * entry, otherwise importing <ConsentProvider> from a Server Component is a
 * build error. Bundlers strip module-level directives, so re-add it here and
 * fail the build if it is missing.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DIRECTIVE = '"use client";';
const targets = ['dist/react/index.js', 'dist/react/index.cjs'];

for (const file of targets) {
  const source = readFileSync(file, 'utf8');
  if (source.trimStart().startsWith('"use client"') || source.trimStart().startsWith("'use client'")) {
    continue;
  }
  writeFileSync(file, `${DIRECTIVE}\n${source}`);
}

for (const file of targets) {
  const first = readFileSync(file, 'utf8').trimStart();
  if (!first.startsWith('"use client"') && !first.startsWith("'use client'")) {
    console.error(`[consent-gate] ${file} is missing the "use client" directive.`);
    process.exit(1);
  }
}

console.log('[consent-gate] "use client" verified on the React entry.');
