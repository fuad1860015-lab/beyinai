const agent = require("./agent");
async function test() {
  const r = await agent.agentSualCavabla({
    sual: "hansı vergi ödəyiciləri üçün pos terminal quraşdırılması məcburidi?",
    qovluq_id: "all"
  });
  console.log("=== SİTATLAR ===");
  r.sitatlar.forEach(s => console.log(`[${s.nomre}] ${s.basliq}`));
}
test().catch(console.error);
