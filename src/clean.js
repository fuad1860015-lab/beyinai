const { db } = require("./db");
const list = [
  'side_nav',
  'language',
  'search_spark',
  'arrow_forward',
  'layers',
  'attach_fileFaylları bura buraxın',
  'Faylları bura buraxın',
  'Gemini-dən çatlar (6)',
  'markdown'
];
for (const ad of list) {
  const m = db.prepare("SELECT id FROM menbeler WHERE ad = ?").get(ad);
  if (m) {
    db.prepare("DELETE FROM parcalar WHERE menbe_id = ?").run(m.id);
    db.prepare("DELETE FROM menbeler WHERE id = ?").run(m.id);
  }
}
console.log("Mənbələr təmizləndi və səliqəyə salındı.");
