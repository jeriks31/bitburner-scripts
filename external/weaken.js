/** @param {NS} ns */
export async function main(ns) {
  // Minimal logic to avoid desync
  const args = ns.args; // [target, delay, processName, verbose]
  await ns.sleep(args[1]);
  const weakenAmount = await ns.weaken(args[0]);

  // Log results
  if (weakenAmount === 0) {
    ns.tprint(`${args[2]}@${args[0]}: Weakened by 0, must be misfire.`);
  }
  else if (args[3] === "true") {
    ns.tprint(`${args[2]}@${args[0]}: Weakened by ${weakenAmount}`);
  }
}