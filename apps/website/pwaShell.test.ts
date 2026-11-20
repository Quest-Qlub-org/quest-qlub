import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { normalizePath, type Rolldown } from "vite";
import { collectAppShell } from "./pwaShell";

function chunk(
  fileName: string,
  overrides: Partial<Rolldown.OutputChunk> = {},
): Rolldown.OutputChunk {
  return {
    type: "chunk",
    fileName,
    isEntry: false,
    isDynamicEntry: false,
    exports: [],
    facadeModuleId: null,
    modules: {},
    moduleIds: [],
    name: fileName,
    dynamicImports: [],
    imports: [],
    implicitlyLoadedBefore: [],
    importedBindings: {},
    referencedFiles: [],
    code: "",
    map: null,
    sourcemapFileName: null,
    preliminaryFileName: fileName,
    ...overrides,
  };
}

describe("PWA app shell", () => {
  it("selects the bootstrap and app with only their static dependencies", () => {
    const app = normalizePath(fileURLToPath(new URL("./src/App.tsx", import.meta.url)));
    const bundle: Rolldown.OutputBundle = {
      "assets/index.js": chunk("assets/index.js", {
        isEntry: true,
        imports: ["assets/shared.js"],
        dynamicImports: ["assets/app.js"],
      }),
      "assets/app.js": chunk("assets/app.js", {
        isDynamicEntry: true,
        facadeModuleId: app,
        imports: ["assets/shared.js"],
        dynamicImports: ["assets/article.js", "assets/writer.js"],
        viteMetadata: {
          importedAssets: new Set(["assets/logo.png"]),
          importedCss: new Set(["assets/style.css"]),
        },
      }),
      "assets/shared.js": chunk("assets/shared.js", { imports: ["assets/vendor.js"] }),
      "assets/vendor.js": chunk("assets/vendor.js"),
      "assets/article.js": chunk("assets/article.js", { isDynamicEntry: true }),
      "assets/writer.js": chunk("assets/writer.js", { imports: ["assets/editor.js"] }),
      "assets/editor.js": chunk("assets/editor.js"),
    };

    expect(collectAppShell(bundle)).toEqual(
      new Set([
        "assets/index.js",
        "assets/shared.js",
        "assets/vendor.js",
        "assets/app.js",
        "assets/logo.png",
        "assets/style.css",
      ]),
    );
  });
});
