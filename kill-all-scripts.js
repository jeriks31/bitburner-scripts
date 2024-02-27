import {getNetworkNodes} from "./server";

/** @param {NS} ns */
export async function main(ns) {
  const scriptName = ns.args[0];
  const servers = getNetworkNodes(ns);
  for (const server of servers) {
    ns.scriptKill(scriptName, server);
  }
}