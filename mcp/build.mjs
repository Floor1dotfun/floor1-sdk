import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const manifest = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
await build({
  entryPoints: [new URL("./src/server.ts", import.meta.url).pathname],
  outfile: new URL("./dist/server.js", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  alias: { "@floor1/sdk": new URL("../src/index.ts", import.meta.url).pathname },
  external: Object.keys(manifest.dependencies).flatMap(name => [name, `${name}/*`]),
  banner: { js: "#!/usr/bin/env node" },
  define: { FLOOR1_MCP_VERSION: JSON.stringify(manifest.version) },
  legalComments: "none",
});
