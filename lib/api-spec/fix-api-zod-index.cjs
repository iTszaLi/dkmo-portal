const { writeFileSync } = require("fs");
const { resolve } = require("path");
writeFileSync(
  resolve(__dirname, "../api-zod/src/index.ts"),
  'export * from "./generated/api";\n',
);
