/** @param {NS} ns */
export async function main(ns) {
  // Minimal logic to avoid desync
  const args = ns.args; // [target, delay, processName, verbose]
  await ns.sleep(args[1]);
  const growMultiplier = await ns.grow(args[0]);

  // Log results
  if (growMultiplier === 1) {
    ns.tprint(`${args[2]}@${args[0]}: Grow by x1, must be misfire.`);
  }
  else if (args[3] === "true") {
    ns.tprint(`${args[2]}@${args[0]}: Grow by x${ns.formatNumber(growMultiplier)}`);
  }
}