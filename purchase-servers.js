/** @type import(".").NS */
let ns = null;

export async function main(_ns) {
    ns = _ns;
    const checkInterval = 5000;

    // Purchase servers with 1/4 of the home server's RAM
    const homeRam = ns.getServerMaxRam("home");
    const initialRam = Math.min((homeRam/4).toFixed(0), ns.getPurchasedServerMaxRam());

    // Continuously try to purchase servers until we've reached the maximum amount of servers
    let i = ns.getPurchasedServers().length;
    while (i < ns.getPurchasedServerLimit()) {
        if (getSpendableMoney(ns) > ns.getPurchasedServerCost(initialRam)){
            let serverName = ns.purchaseServer("pserv", initialRam);
            if (serverName){
                ns.tprint(`Purchased server: ${serverName}`);
                ++i;
            }
        }
        await ns.sleep(checkInterval);
    }

    // Continuously try to upgrade servers to the next power of 2
    while (true) {
        let maxedServers = 0;
        for (const server of ns.getPurchasedServers()) {
            let currentRam = ns.getServerMaxRam(server);
            if (getSpendableMoney(ns) > ns.getPurchasedServerUpgradeCost(server, currentRam*2)) {
                ns.upgradePurchasedServer(server, currentRam*2);
                ns.tprint(`Upgraded ${server} to ${currentRam*2}GB`);
            }
            if (currentRam === ns.getPurchasedServerMaxRam()) {
                maxedServers++;
            }
            await ns.sleep(checkInterval);
        }
        if (maxedServers === ns.getPurchasedServerLimit()) {
            ns.tprint("All servers are maxed out, exiting purchase-servers.js");
            break;
        }
    }
}

function getSpendableMoney(ns) {
    const maxUsePercent = 0.5; // Only purchase/upgrade for maximum this percentage of total money
    return ns.getServerMoneyAvailable("home") * maxUsePercent;
}