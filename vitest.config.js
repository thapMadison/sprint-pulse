import { defineConfig } from 'vitest/config';

// Dev-only test config. Not part of the shipped artifact — GitHub Pages serves
// index.html + src/ + assets/ only and never runs this.
export default defineConfig({
  test: {
    // Pure-logic tests run in Node. Files that need the DOM opt in per-file with
    //   // @vitest-environment jsdom
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text', 'html'],
    },
  },
});
