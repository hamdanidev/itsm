#!/usr/bin/env node
/**
 * Helper CLI PocketBase lokal (tanpa Docker).
 *
 *   npm run pb:download
 *   npm run pb:serve
 *   npm run pb:superuser -- admin@itsm.local "PasswordKuat123!"
 *   npm run pb:migrate -- collections
 */
import {
  binaryPath,
  dataDir,
  ensurePocketBase,
  healthUrl,
  migrationsDir,
  runPocketBase,
  serveArgs,
  spawnPocketBase,
} from "./lib/pocketbase.mjs";

const [command, ...rest] = process.argv.slice(2);

function usage() {
  console.log(`Penggunaan:
  node scripts/pocketbase.mjs download                 Unduh binary PocketBase
  node scripts/pocketbase.mjs serve [opsi...]          Jalankan PocketBase dev
  node scripts/pocketbase.mjs superuser create <email> <password>
  node scripts/pocketbase.mjs migrate <perintah...>    Migrasi collection

Binary  : ${binaryPath()}
Data    : ${dataDir}
Health  : ${healthUrl()}
`);
}

async function main() {
  switch (command) {
    case "download": {
      await ensurePocketBase();
      return;
    }

    case "serve": {
      const child = await spawnPocketBase(rest);
      child.on("exit", (code) => process.exit(code ?? 0));
      return;
    }

    case "superuser": {
      if (rest[0] !== "create" || !rest[1] || !rest[2]) {
        console.error(
          'Format: npm run pb:superuser -- <email> "<password>"\n' +
            "Contoh: npm run pb:superuser -- admin@itsm.local \"PasswordKuat123!\""
        );
        process.exitCode = 1;
        return;
      }

      await runPocketBase(
        ["superuser", "create", rest[1], rest[2], `--dir=${dataDir}`],
        "superuser create"
      );
      return;
    }

    case "migrate": {
      if (!rest.length) {
        console.error(
          "Format: npm run pb:migrate -- <perintah>\n" +
            'Contoh: npm run pb:migrate -- collections'
        );
        process.exitCode = 1;
        return;
      }

      await runPocketBase([
        "migrate",
        ...rest,
        `--dir=${dataDir}`,
        `--migrationsDir=${migrationsDir}`,
      ]);
      return;
    }

    default:
      usage();
      if (command) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[pocketbase] ${error.message}`);
  process.exitCode = 1;
});
