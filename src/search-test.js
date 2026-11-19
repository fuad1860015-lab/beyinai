const { db } = require("./db");
const rows = db.prepare("SELECT basliq, metn FROM parcalar WHERE metn LIKE '%45%'").all();
console.log('Metn icinde 45 olan blok sayi:', rows.length);
rows.forEach((r, i) => console.log(`[${i+1}] ${r.basliq} -> ${r.metn.slice(0, 200)}...`));
