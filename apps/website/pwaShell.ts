import { fileURLToPath } from "node:url";
import { normalizePath, type Plugin, type Rolldown } from "vite";

// The bootstrap loads App only once the environment check has passed.
const appModule = normalizePath(fileURLToPath(new URL("./src/App.tsx", import.meta.url)));

export function collectAppShell(bundle: Rolldown.OutputBundle): Set<string> {
  const files = new Set<string>();

  function addChunk(chunk: Rolldown.OutputChunk) {
    if (files.has(chunk.fileName)) return;

    files.add(chunk.fileName);
    chunk.viteMetadata?.importedCss.forEach((file) => files.add(file));
    chunk.viteMetadata?.importedAssets.forEach((file) => files.add(file));
    for (const file of chunk.imports) {
      const dependency = bundle[file];
      if (dependency?.type === "chunk") addChunk(dependency);
    }
  }

  for (const file of Object.values(bundle)) {
    if (file.type === "chunk" && (file.isEntry || file.facadeModuleId === appModule)) {
      addChunk(file);
    }
  }
  return files;
}

export function trackAppShell(files: Set<string>): Plugin {
  return {
    name: "quest-qlub-pwa-shell",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        files.clear();
        for (const file of collectAppShell(bundle)) files.add(file);
      },
    },
  };
}
