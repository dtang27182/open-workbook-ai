import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as devCerts from "office-addin-dev-certs";
import { defineConfig, type Plugin } from "vite";

const ROOT_DIRECTORY = fileURLToPath(new URL("./", import.meta.url));
const DEVELOPMENT_URL = "https://localhost:3000/";
const PRODUCTION_URL = "https://open-workbook-ai-addin.pages.dev/";
const TASKPANE_PATH = "src/frontend/taskpane/taskpane.html";
const MANIFEST_TASKPANE_PATH = "src/taskpane/taskpane.html";

const HTML_ENTRIES = {
  taskpane: resolve(ROOT_DIRECTORY, TASKPANE_PATH),
  openrouterAuthDialog: resolve(ROOT_DIRECTORY, "src/frontend/auth-dialog/openrouter-auth-dialog.html"),
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
  plugins: [manifestTaskpaneRoute(), copyOfficeFiles(mode === "development")],
  server: {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    https: command === "serve" ? await devCerts.getHttpsServerOptions() : undefined,
    port: 3000,
    strictPort: true,
  },
}));

function manifestTaskpaneRoute(): Plugin {
  return {
    name: "manifest-taskpane-route",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?", 1)[0] === `/${MANIFEST_TASKPANE_PATH}`) {
          response.writeHead(307, {
            Location: request.url.replace(`/${MANIFEST_TASKPANE_PATH}`, `/${TASKPANE_PATH}`),
          });
          response.end();
        } else {
          next();
        }
      });
    },
    async writeBundle() {
      const manifestTaskpane = resolve(ROOT_DIRECTORY, "dist", MANIFEST_TASKPANE_PATH);
      await mkdir(dirname(manifestTaskpane), { recursive: true });
      await copyFile(resolve(ROOT_DIRECTORY, "dist", TASKPANE_PATH), manifestTaskpane);
    },
  };
}

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
