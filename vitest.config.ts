import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', include: ['apps/**/*.test.{ts,tsx}','packages/**/*.test.ts','tests/**/*.test.ts'], exclude: ['**/node_modules/**','tests/e2e/**'], setupFiles: ['./apps/web/src/test/setup.ts'], coverage: { reporter: ['text','html'] } } });
