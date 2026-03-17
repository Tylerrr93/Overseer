import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "./", // relative paths for GitHub Pages
  resolve: {
    alias: {
      "@engine": resolve(__dirname, "src/engine"),
      "@game":   resolve(__dirname, "src/game"),
      "@types":  resolve(__dirname, "src/types"),
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
  },
});
