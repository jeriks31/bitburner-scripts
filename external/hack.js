/** @param {NS} ns */
export async function main(ns) {
  // Minimal logic to avoid desync
  // args: [target, sleepUntil, processName, verbose]
  const args = ns.args;
  await ns.sleep(args[1] - Date.now());
  const stealAmount = await ns.hack(args[0]);

  // Log results. 2 leading spaces to align with weaken.js logs
  if (stealAmount === 0) {
    ns.tprint(`  ${args[2]}@${args[0]}: Hack for $0. Must be misfire or failed hack`);
  }
  else if (args[3]) {
    ns.tprint(`  ${args[2]}@${args[0]}: Hack for $${ns.formatNumber(stealAmount)}`);
  }
}