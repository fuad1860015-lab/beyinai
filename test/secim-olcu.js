// Pulsuz, internetsiz ölçü: cavab üçün lazım olan bəndlər seçilən mətnin içindədirmi?
//   node test/secim-olcu.js [baza qovluğu]     (verilməsə, əsas bazanın müvəqqəti surəti)
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let qovluq = process.argv[2];
let muveqqeti = null;
if (!qovluq) {
  muveqqeti = fs.mkdtempSync(path.join(os.tmpdir(), "beyin-secim-"));
  for (const f of ["beyin.sqlite", "beyin.sqlite-wal", "beyin.sqlite-shm"]) {
    const s = path.join(__dirname, "..", "data", f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(muveqqeti, f));
  }
  qovluq = muveqqeti;
}
process.env.BEYIN_DATA_DIR = path.resolve(qovluq);
globalThis.fetch = async () => { throw new Error("oflayn ölçü"); };

const db = require("../src/db");
require("../src/agent");
const { bendleriSec } = require("../src/bend-secimi");
const imtahan = require("./imtahan-suallari.json").map(s => ({ id: s.id, sual: s.sual, lazim: [s.madde] }));
const lazimBendler = {
  "kassa-xidmet": ["109.8", "108.1"], "adgunu": ["109.3", "109.4"], "mehmanxana": ["108.4"], "esas-vesait-cek": ["109.8", "109.1"],
  "iki-limit": ["109.8"], "kart": ["109.5"], "bolgu": ["108.2"], "sanksiya-mal": ["108.1-1"], "emtessiz": ["109.9"], "temir": ["109.1"]
};
const beyin = require("./beyin-suallari.json").map(s => ({ id: s.id, sual: s.sual, lazim: lazimBendler[s.id] }));
const istifadeci = [{
  id: "istifadeci", lazim: ["109.8", "108.1", "50.8"],
  sual: "qaimə ilə yox, kassa çeki ilə alınmış mal və ya xidmətlər mənfəət bəyannaməsində xərcə tanına bilərmi? hansı dərəcədə? hansı şərtlərlə?"
}];

let tapildi = 0, cemi = 0;
for (const s of [...istifadeci, ...beyin, ...imtahan]) {
  const bas = Date.now();
  const secilen = bendleriSec({ sual: s.sual, saheId: db.aktivSaheIdAl() });
  const var_ = (n) => secilen.some(x => x.nomre_metni === n || x.nomre_metni.startsWith(`${n}.`) || n.startsWith(`${x.nomre_metni}.`));
  const yox = s.lazim.filter(n => !var_(n));
  tapildi += s.lazim.length - yox.length;
  cemi += s.lazim.length;
  console.log(`${yox.length ? "❌" : "✅"} ${s.id.padEnd(20)} ${secilen.length} bənd, ${secilen.reduce((t, x) => t + x.metn.length, 0)} işarə, ${Date.now() - bas} ms${yox.length ? ` | yoxdur: ${yox.join(", ")}` : ""}`);
}
console.log(`\nLazım olan bəndlərdən tapılan: ${tapildi}/${cemi}`);
db.db.close();
if (muveqqeti) fs.rmSync(muveqqeti, { recursive: true, force: true });
