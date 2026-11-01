// Memuat modul hook PocketBase (CommonJS, dieksekusi Goja) ke dalam Node.
// Repo ini `"type": "module"`, sehingga file .js di pb_hooks akan dianggap ESM
// oleh Node; di sini isinya dievaluasi dengan pembungkus CommonJS.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = fileURLToPath(new URL("../../backend/pb_hooks/", import.meta.url));

export function loadHookModule(relativePath) {
  const file = path.resolve(hooksDir, relativePath);
  const source = readFileSync(file, "utf8");
  const module = { exports: {} };

  const factory = new Function(
    "module",
    "exports",
    "require",
    `${source}\n//# sourceURL=${file.replace(/\\/g, "/")}`
  );

  factory(module, module.exports, (request) => {
    throw new Error(`require(${request}) tidak didukung di unit test`);
  });

  return module.exports;
}
