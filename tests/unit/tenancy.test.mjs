// Mode tenancy membaca environment. Di Node, global `$os` disimulasikan supaya
// kedua cabang (standalone/vendor) bisa diuji tanpa PocketBase.
import assert from "node:assert/strict";
import test from "node:test";

import { loadHookModule } from "../lib/load-hook.mjs";

globalThis.ForbiddenError = class ForbiddenError extends Error {};

const tenancy = loadHookModule("lib/tenancy.js");

function withMode(value, fn) {
  if (value === null) {
    delete globalThis.$os;
  } else {
    globalThis.$os = {
      getenv: (name) => (name === "TENANCY_MODE" ? value : ""),
    };
  }

  try {
    fn();
  } finally {
    delete globalThis.$os;
  }
}

function record(isPlatform) {
  return {
    get: (key) => (key === "is_platform_staff" ? isPlatform : undefined),
  };
}

test("normalize menerima alias dan gagal tertutup ke standalone", () => {
  assert.equal(tenancy.normalize("vendor"), "vendor");
  assert.equal(tenancy.normalize(" VENDOR "), "vendor");
  assert.equal(tenancy.normalize("multi"), "vendor");
  assert.equal(tenancy.normalize("standalone"), "standalone");
  assert.equal(tenancy.normalize("single"), "standalone");

  assert.equal(tenancy.normalize(""), "standalone");
  assert.equal(tenancy.normalize(undefined), "standalone");
  assert.equal(tenancy.normalize("ngawur"), "standalone");
});

test("tanpa environment, mode default standalone", () => {
  withMode(null, () => {
    assert.equal(tenancy.current(), "standalone");
    assert.equal(tenancy.isVendor(), false);
  });
});

test("TENANCY_MODE=vendor mengaktifkan konsol vendor", () => {
  withMode("vendor", () => {
    assert.equal(tenancy.current(), "vendor");
    assert.equal(tenancy.isVendor(), true);
  });
});

test("assertVendor menolak instalasi standalone", () => {
  withMode(null, () => {
    assert.throws(() => tenancy.assertVendor(), /Konsol vendor/);
  });

  withMode("vendor", () => {
    assert.doesNotThrow(() => tenancy.assertVendor());
  });
});

test("login akun platform hanya diizinkan pada mode vendor", () => {
  withMode(null, () => {
    assert.throws(
      () => tenancy.assertPlatformLoginAllowed(record(true)),
      /standalone/
    );
    assert.doesNotThrow(() => tenancy.assertPlatformLoginAllowed(record(false)));
  });

  withMode("vendor", () => {
    assert.doesNotThrow(() => tenancy.assertPlatformLoginAllowed(record(true)));
  });
});
