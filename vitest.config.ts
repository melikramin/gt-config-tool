import { defineConfig } from 'vitest/config';

// Отдельный конфиг для юнит-тестов чистых модулей (без Electron/DOM).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
