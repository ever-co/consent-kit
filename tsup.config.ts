import { defineConfig, type Options } from 'tsup';

const shared: Options = {
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // `clean` is handled by scripts/clean.mjs so the two passes cannot wipe
  // each other's output.
  clean: false,
  treeshake: true,
  splitting: false,
  target: 'es2020',
  // React and the CMP stay external: React is a peer dep spanning ^18.2 || ^19
  // and must never be bundled; vanilla-cookieconsent should dedupe in the app.
  external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'vanilla-cookieconsent'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
};

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
    banner: { js: '/* consent-gate — MIT. See THIRD-PARTY-NOTICES.md */' },
  },
  {
    ...shared,
    entry: { 'react/index': 'src/react/index.tsx' },
    // The `"use client"` directive is re-added and verified by
    // scripts/add-use-client.mjs — bundlers strip module-level directives, and
    // tsup does not apply `banner` reliably to the second config in an array.
    banner: { js: '/* consent-gate — MIT. See THIRD-PARTY-NOTICES.md */' },
  },
]);
