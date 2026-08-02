import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    restoreMocks: true,
  },
});
