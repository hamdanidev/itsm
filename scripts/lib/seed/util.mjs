// Utilitas kecil untuk alat seed: parsing argumen, RNG deterministik, tanggal,
// dan output konsol.
import { createInterface } from "node:readline/promises";

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function parseArgs(argv, spec) {
  const options = { ...spec.defaults };
  const raw = argv.slice(2);

  const takeValue = (index, name) => {
    const value = raw[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Nilai untuk ${name} tidak ditemukan.`);
    }
    return { value, next: index + 1 };
  };

  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i];

    if (!arg.startsWith("--")) {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }

    const equals = arg.indexOf("=");
    const name = (equals >= 0 ? arg.slice(0, equals) : arg).slice(2);
    const inline = equals >= 0 ? arg.slice(equals + 1) : undefined;
    const def = spec.options[name];

    if (!def) {
      throw new Error(`Opsi tidak dikenal: --${name}`);
    }

    if (def.type === "boolean") {
      options[def.key] = inline === undefined ? true : inline !== "false";
      continue;
    }

    let value = inline;
    if (value === undefined) {
      const taken = takeValue(i, arg);
      value = taken.value;
      i = taken.next;
    }

    if (def.type === "number") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Nilai --${name} harus angka.`);
      }
      options[def.key] = parsed;
      continue;
    }

    if (def.choices && !def.choices.includes(value)) {
      throw new Error(`Nilai --${name} harus salah satu dari: ${def.choices.join(", ")}`);
    }

    options[def.key] = value;
  }

  return options;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRandom(seed) {
  const random = mulberry32(seed);

  return {
    next: random,
    int(min, max) {
      return Math.floor(random() * (max - min + 1)) + min;
    },
    pick(list) {
      return list[Math.floor(random() * list.length)];
    },
    chance(probability) {
      return random() < probability;
    },
    shuffle(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

export function iso(ms) {
  return new Date(ms).toISOString();
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Jam kerja WIB untuk membuat waktu kejadian yang masuk akal.
export function workingHourMs(baseMs, random, { start = 7, end = 20 } = {}) {
  const wib = new Date(baseMs + 7 * HOUR);
  const hour = random.int(start, end);
  const minute = random.int(0, 59);
  wib.setUTCHours(hour, minute, random.int(0, 59), 0);
  return wib.getTime() - 7 * HOUR;
}

export function humanDate(value) {
  const date = parseDate(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

const COLOR = process.env.NO_COLOR
  ? {
      dim: "",
      bold: "",
      green: "",
      yellow: "",
      red: "",
      cyan: "",
      magenta: "",
      reset: "",
    }
  : {
      dim: "\x1b[2m",
      bold: "\x1b[1m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      red: "\x1b[31m",
      cyan: "\x1b[36m",
      magenta: "\x1b[35m",
      reset: "\x1b[0m",
    };

export const color = COLOR;

export function createLogger({ quiet = false } = {}) {
  const log = (message) => {
    if (!quiet) console.log(message);
  };

  return {
    title(text) {
      log(`\n${color.bold}${text}${color.reset || ""}`);
    },
    step(text) {
      log(`${color.cyan}•${color.reset} ${text}`);
    },
    detail(text) {
      log(`${color.dim}  ${text}${color.reset}`);
    },
    success(text) {
      log(`${color.green}✓${color.reset} ${text}`);
    },
    warn(text) {
      console.warn(`${color.yellow}!${color.reset} ${text}`);
    },
    error(text) {
      console.error(`${color.red}✗${color.reset} ${text}`);
    },
    plain(text) {
      log(text);
    },
  };
}

export async function confirm(question, { defaultAnswer = false } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return defaultAnswer;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = defaultAnswer ? " [Y/n] " : " [y/N] ";
    const answer = (await rl.question(question + suffix)).trim().toLowerCase();
    if (!answer) return defaultAnswer;
    return answer === "y" || answer === "ya" || answer === "yes";
  } finally {
    rl.close();
  }
}

export function plural(count, singular, pluralLabel) {
  return `${count} ${count === 1 ? singular : pluralLabel || singular}`;
}
