// Beyni terminaldan qurur:  npm run beyin            → əsas bazada
//                           npm run beyin -- --data <qovluq>   → başqa baza qovluğunda
"use strict";

const path = require("node:path");
const arq = process.argv.slice(2);
const i = arq.indexOf("--data");
if (i >= 0) process.env.BEYIN_DATA_DIR = path.resolve(arq[i + 1]);

const db = require("../src/db");
const beyin = require("../src/beyin");

(async () => {
  console.log(`Baza: ${db.DB_PATH}`);
  const netice = await beyin.qur({ addim: (m) => console.log(`  • ${m}`) });
  console.log(netice);
  db.db.close();
  process.exit(netice.ok ? 0 : 1);
})();
