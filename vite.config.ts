import path from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: { options: { typeAware: true, typeCheck: false } },
  run: {
    cache: true,
  },
  resolve: {
    alias: {
      "virtual:pwa-register/react": path.resolve(
        import.meta.dirname,
        "apps/website/src/test/mockPwaRegister.ts",
      ),
    },
  },
});
