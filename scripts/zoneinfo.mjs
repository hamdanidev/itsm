// Menyegarkan `backend/zoneinfo.zip` — basis data zona IANA (TZif) yang dibaca
// Go lewat `ZONEINFO`.
//
// Kenapa dibundel: `time.LoadLocation` hanya memakai zona sistem bila ada
// (Linux dengan paket tzdata). Di Windows jalur itu tidak ada, sehingga Go
// diam-diam mengembalikan UTC untuk nama zona apa pun dan seluruh SLA menjadi
// salah. Dengan `ZONEINFO` menunjuk ke file ini, hasilnya sama di semua OS.
//
// Sumber: toolchain Go menyertakan `$GOROOT/lib/time/zoneinfo.zip` yang sudah
// dikompilasi dari rilis tzdata terbaru. Jalankan ulang saat memperbarui Go
// (atau saat rilis tzdata baru dibutuhkan).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const destination = path.join(rootDir, "backend", "zoneinfo.zip");

function fail(message) {
  console.error(`[zoneinfo] ${message}`);
  process.exit(1);
}

let goroot = "";

try {
  goroot = execFileSync("go", ["env", "GOROOT"], { encoding: "utf8" }).trim();
} catch {
  fail(
    "Perintah `go` tidak ditemukan. Pasang Go (https://go.dev/dl/) lalu jalankan ulang, " +
      "atau salin zoneinfo.zip dari $GOROOT/lib/time/zoneinfo.zip secara manual."
  );
}

if (!goroot) fail("GOROOT kosong; instalasi Go tidak lengkap.");

const source = path.join(goroot, "lib", "time", "zoneinfo.zip");

if (!existsSync(source)) {
  fail(`Tidak menemukan ${source}. Periksa instalasi Go.`);
}

copyFileSync(source, destination);

const size = statSync(destination).size;
console.log(`[zoneinfo] ${destination} diperbarui (${Math.round(size / 1024)} KB).`);
