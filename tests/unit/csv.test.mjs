// Unit test parser CSV untuk impor anggota: pemisah, kutip, BOM, dan baris kosong.
import assert from "node:assert/strict";
import test from "node:test";

import { loadHookModule } from "../lib/load-hook.mjs";

const { parse, detectDelimiter } = loadHookModule("lib/csv.js");

test("CSV koma mendukung tanda kutip dan escape kutip ganda", () => {
  const rows = parse(
    'nama,email\n"Budi, S.Kom",budi@rs.example\n"Siti ""Aminah""",siti@rs.example\n'
  );

  assert.deepEqual(rows, [
    ["nama", "email"],
    ["Budi, S.Kom", "budi@rs.example"],
    ['Siti "Aminah"', "siti@rs.example"],
  ]);
});

test("titik koma dan tab terdeteksi otomatis", () => {
  assert.equal(detectDelimiter("nama;email;role"), ";");
  assert.equal(detectDelimiter("nama\temail\trole"), "\t");

  assert.deepEqual(parse("nama;email\nBudi;budi@rs.example"), [
    ["nama", "email"],
    ["Budi", "budi@rs.example"],
  ]);
});

test("BOM, CRLF, dan baris kosong tidak menghasilkan baris palsu", () => {
  const rows = parse("\uFEFFnama,email\r\nBudi,budi@rs.example\r\n\r\n");

  assert.deepEqual(rows, [
    ["nama", "email"],
    ["Budi", "budi@rs.example"],
  ]);
});

test("sel kosong di ujung baris tetap dipertahankan", () => {
  assert.deepEqual(parse("a,b,c\n1,,\n"), [
    ["a", "b", "c"],
    ["1", "", ""],
  ]);
});

test("berkas kosong menghasilkan daftar kosong", () => {
  assert.deepEqual(parse(""), []);
  assert.deepEqual(parse("\r\n\r\n"), []);
});
