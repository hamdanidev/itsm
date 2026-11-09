// Memuat modul hook PocketBase (CommonJS, dieksekusi Goja) ke dalam Node.
// Repo ini `"type": "module"`, sehingga file .js di pb_hooks akan dianggap ESM
// oleh Node; di sini isinya dievaluasi dengan pembungkus CommonJS.
//
// `require` lokal didukung untuk modul di dalam pb_hooks (mis. `lib/timezone.js`)
// agar hook bisa dipakai ulang apa adanya. `__hooks` di Goja adalah variabel
// global; di sini diteruskan sebagai parameter pembungkus supaya modul tidak
// perlu diubah.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hooksRoot = fileURLToPath(new URL("../../backend/pb_hooks/", import.meta.url)).replace(
  /\\/g,
  "/"
);
const hooksDir = path.resolve(hooksRoot);

const cache = new Map();

function resolveRequest(fromFile, request) {
  const target = String(request == null ? "" : request);

  let relative = "";

  if (target.startsWith(hooksRoot)) {
    relative = target.slice(hooksRoot.length);
  } else if (target.startsWith("__hooks/")) {
    relative = target.slice("__hooks".length);
  } else if (target.startsWith(".")) {
    relative = path.relative(hooksDir, path.resolve(path.dirname(fromFile), target)).replace(
      /\\/g,
      "/"
    );
  } else {
    throw new Error(`require(${target}) tidak didukung di unit test`);
  }

  const file = path.resolve(hooksDir, relative.replace(/^[\\/]+/, ""));

  if (!file.startsWith(hooksDir + path.sep) && file !== hooksDir) {
    throw new Error(`require(${target}) keluar dari direktori pb_hooks`);
  }

  return file;
}

function loadFile(file) {
  const cached = cache.get(file);
  if (cached) return cached.exports;

  const module = { exports: {} };
  cache.set(file, module);

  const source = readFileSync(file, "utf8");
  const factory = new Function(
    "module",
    "exports",
    "require",
    "__hooks",
    `${source}\n//# sourceURL=${file.replace(/\\/g, "/")}`
  );

  factory(
    module,
    module.exports,
    (request) => loadFile(resolveRequest(file, request)),
    hooksRoot.replace(/\/$/, "")
  );

  return module.exports;
}

export function loadHookModule(relativePath) {
  return loadFile(path.resolve(hooksDir, relativePath));
}
