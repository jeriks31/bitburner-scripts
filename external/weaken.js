/** @param {NS} ns */
export async function main(ns) {
  // Minimal logic to avoid desync
  // args: [target, sleepUntil, processName, verbose]
  const args = ns.args;
  await ns.sleep(args[1] - Date.now());
  const weakenAmount = await ns.weaken(args[0]);

  // Log results
  if (weakenAmount === 0) {
    ns.tprint(`${args[2]}@${args[0]}: Weakened by 0, must be misfire.`);
  }
  else if (args[3]) {
    ns.tprint(`${args[2]}@${args[0]}: Weakened by ${weakenAmount}`);
  }
}