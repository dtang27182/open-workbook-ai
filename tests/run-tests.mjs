import { JSDOM } from "jsdom";
import { createServer } from "vite";

const dom = new JSDOM("", { url: "https://localhost:3000/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});

try {
  await server.ssrLoadModule(`/tests/${process.argv[2]}.test.ts`);
} finally {
  await server.close();
}
