/** @param {NS} ns */
export async function main(ns) {
  // Minimal logic to avoid desync
  // args: [target, sleepUntil, processName, verbose]
  await ns.sleep(ns.args[1] - Date.now());
  const weakenAmount = await ns.weaken(ns.args[0]);

  // Log results
  if (weakenAmount === 0) {
    ns.tprint(`${ns.args[2]}@${ns.args[0]}: Weakened by 0, must be misfire.`);
  }
  else if (ns.args[3]) {
    ns.tprint(`${ns.args[2]}@${ns.args[0]}: Weakened by ${weakenAmount}`);
  }
}