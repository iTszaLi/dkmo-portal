const { readFileSync, writeFileSync } = require("fs");
const { resolve } = require("path");
const generatedPath = resolve(__dirname, "../api-zod/src/generated/api.ts");
const generated = readFileSync(generatedPath, "utf8")
  // Orval 8 emits these Zod 4 helpers, but this workspace intentionally uses
  // Zod 3. Keep the generated contract runnable in the API server.
  .replaceAll("zod.int()", "zod.number().int()")
  .replaceAll("zod.uuid()", "zod.string().uuid()");

const clientPath = resolve(__dirname, "../api-client-react/src/generated/api.ts");
const client = readFileSync(clientPath, "utf8").replaceAll("h.entries()", "(h as any).entries()");
writeFileSync(clientPath, `${client.trimEnd()}\n`);
const schemasPath = resolve(__dirname, "../api-client-react/src/generated/api.schemas.ts");
writeFileSync(schemasPath, `${readFileSync(schemasPath, "utf8").trimEnd()}\n`);
writeFileSync(generatedPath, `${generated.trimEnd()}\n`);
writeFileSync(
  resolve(__dirname, "../api-zod/src/index.ts"),
  'export * from "./generated/api";\n',
);
