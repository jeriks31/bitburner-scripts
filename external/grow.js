/** @param {NS} ns */
export async function main(ns) {
  // Minimal logic to avoid desync
  // args: [target, sleepUntil, processName, verbose]
  const args = ns.args;
  await ns.sleep(args[1] - Date.now());
  const growMultiplier = await ns.grow(args[0]);

  // Log results 2 leading spaces to align with weaken.js logs
  if (growMultiplier === 1) {
    ns.tprint(`  ${args[2]}@${args[0]}: Grow by x1, must be misfire.`);
  }
  else if (args[3]) {
    ns.tprint(`  ${args[2]}@${args[0]}: Grow by x${ns.formatNumber(growMultiplier)}`);
  }
}