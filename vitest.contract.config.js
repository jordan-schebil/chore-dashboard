import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/contract/**/*.{test,spec}.js'],
    environment: 'node',
    globals: true,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 45_000
  }
});
