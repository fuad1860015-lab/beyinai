const agent = require("./agent");
async function test() {
  const r = await agent.agentSualCavabla({
    sual: "45000 manat dövriyyəyə qədər azadolma kimlərə aiddir? şərtləri nələrdir?",
    qovluq_id: "all"
  });
  console.log("=== AGENT CAVABI ===");
  console.log(r.cavab.metn);
}
test().catch(console.error);
