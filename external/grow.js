/** @param {NS} ns */
export async function main(ns) {
  // Minimal logic to avoid desync
  // args: [target, sleepUntil, processName, verbose]
  await ns.sleep(ns.args[1] - Date.now());
  const growMultiplier = await ns.grow(ns.args[0]);

  // Log results 2 leading spaces to align with weaken.js logs
  if (growMultiplier === 1) {
    ns.tprint(`  ${ns.args[2]}@${ns.args[0]}: Grow by x1, must be misfire.`);
  }
  else if (ns.args[3]) {
    ns.tprint(`  ${ns.args[2]}@${ns.args[0]}: Grow by x${ns.formatNumber(growMultiplier)}`);
  }
}