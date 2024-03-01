/** @param {NS} ns */
export async function main(ns) {
  // Minimal logic to avoid desync
  // args: [target, sleepUntil, processName, verbose]
  await ns.sleep(ns.args[1] - Date.now());
  const stealAmount = await ns.hack(ns.args[0]);

  // Log results. 2 leading spaces to align with weaken.js logs
  if (stealAmount === 0) {
    ns.tprint(`  ${ns.args[2]}@${ns.args[0]}: Hack for $0. Must be misfire or failed hack`);
  }
  else if (ns.args[3]) {
    ns.tprint(`  ${ns.args[2]}@${ns.args[0]}: Hack for $${ns.formatNumber(stealAmount)}`);
  }
}