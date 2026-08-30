import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Never scan the gitignored .claude/ tree. It can hold nested git
    // worktrees for parallel sessions, and vitest would otherwise pick up a
    // second copy of every *.test.ts from those checkouts (whose files may
    // carry a different checkout's line endings), producing phantom failures.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
