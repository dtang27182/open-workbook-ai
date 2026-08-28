import { cp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as devCerts from "office-addin-dev-certs";
import { defineConfig, type Plugin } from "vite";

const ROOT_DIRECTORY = fileURLToPath(new URL("./", import.meta.url));
const DEVELOPMENT_URL = "https://localhost:3000/";
const PRODUCTION_URL = "https://open-workbook-ai-addin.pages.dev/";

const HTML_ENTRIES = {
  taskpane: resolve(ROOT_DIRECTORY, "src/taskpane/taskpane.html"),
  openrouterAuthDialog: resolve(ROOT_DIRECTORY, "src/auth-dialog/openrouter-auth-dialog.html"),
};

export default defineConfig(async ({ command, mode }) => ({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: HTML_ENTRIES,
    },
  },
  plugins: [copyOfficeFiles(mode === "development")],
  server: {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    https: command === "serve" ? await devCerts.getHttpsServerOptions() : undefined,
    port: 3000,
    strictPort: true,
  },
}));

function copyOfficeFiles(development: boolean): Plugin {
  return {
    name: "copy-office-files",
    apply: "build",
    async writeBundle() {
      // Copy the Office manifest icons and other static assets into the build output.
      const sourceAssetsDirectory = resolve(ROOT_DIRECTORY, "assets");
      const outputAssetsDirectory = resolve(ROOT_DIRECTORY, "dist/assets");
      await cp(sourceAssetsDirectory, outputAssetsDirectory, { recursive: true });

      // Prepare the manifest with URLs for the selected build environment.
      const sourceManifestPath = resolve(ROOT_DIRECTORY, "manifest.xml");
      const outputManifestPath = resolve(ROOT_DIRECTORY, "dist/manifest.xml");
      const sourceManifest = await readFile(sourceManifestPath, "utf8");
      let outputManifest: string;
      if (development) {
        outputManifest = sourceManifest;
      } else {
        outputManifest = sourceManifest.replaceAll(DEVELOPMENT_URL, PRODUCTION_URL);
      }

      // Write the environment-specific manifest alongside the generated application files.
      await writeFile(outputManifestPath, outputManifest);
    },
  };
}
