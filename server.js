const securityDecreasePerWeaken = 0.05; // Saves a call to ns.weakenAnalyze()

class Server {
    /** @type import(".").NS */
    ns;

    // Permanent properties
    servername;
    requiredPorts;

    // Dynamic properties
    get hasRootAccess() { return this.ns.hasRootAccess(this.servername); }

    constructor(ns, servername) {
        this.ns = ns;
        this.servername = servername;
        this.requiredPorts = ns.getServerNumPortsRequired(servername);
    }

    crack() {
        const cracks = {
            "SQLInject.exe": this.ns.sqlinject,
            "HTTPWorm.exe": this.ns.httpworm,
            "relaySMTP.exe": this.ns.relaysmtp,
            "FTPCrack.exe": this.ns.ftpcrack,
            "BruteSSH.exe": this.ns.brutessh
        };
        for (const [tool, func] of Object.entries(cracks)) {
            if (this.ns.fileExists(tool)) {
                func(server);
            }
        }
        try {
            this.ns.nuke(server);
            return true;
        } catch (e) {
            return false;
        }
    }
}

export class HackTarget extends Server {
    // Permanent properties
    requiredHackLevel;
    maxMoney;
    minSecurity;
    scriptRamHack = 1.7;
    scriptRamWeaken = 1.75;
    scriptRamGrow = 1.75;
    scheduledUntil = 0;
    preppingUntil = 0;


    // Dynamic properties
    get money() { return this.ns.getServerMoneyAvailable(this.servername); }
    get securityLevel() { return this.ns.getServerSecurityLevel(this.servername); }
    get isMinSecurity() { return this.securityLevel === this.minSecurity; }
    get isMaxMoney() { return this.money === this.maxMoney; }
    get isPrepared() { return this.isMinSecurity && this.isMaxMoney; }
    get growTime() { return this.ns.getGrowTime(this.servername); } //todo: formulas.exe
    get hackTime() { return this.ns.getHackTime(this.servername); } //todo: formulas.exe
    get weakenTime() { return this.ns.getWeakenTime(this.servername); } //todo: formulas.exe
    get moneyYield() {
        if(this.ns.fileExists("Formulas.exe")){
            const player = this.ns.getPlayer();
            const server = this.ns.getServer(this.servername);
            server.hackDifficulty = server.minDifficulty;
            return this.maxMoney * ns.formulas.hacking.hackChange(server, player);
        }
        else {
            // maxMoney * 1 if hackingLevel >= 3*requiredHackLevel, otherwise fall off to estimate reduced hackChance
            // No idea how accurate this is, but beginner guide said 3*requiredHackLevel is a good rule of thumb
            return this.maxMoney * Math.min(1, (1.33 - this.requiredHackLevel / this.ns.getHackingLevel()));
        }
    }
    get isPrepping() { return this.preppingUntil > Date.now(); }
    get longestToolTime() { return Math.max(this.weakenTime, this.growTime, this.hackTime); }

    constructor(ns, servername) {
        super(ns, servername);
        this.requiredHackLevel = ns.getServerRequiredHackingLevel(servername);
        this.maxMoney = ns.getServerMaxMoney(servername);
        this.minSecurity = ns.getServerMinSecurityLevel(servername);
    }

    calculateThreads(moneyStealFactor=0.5) {
        const useFormulas = this.ns.fileExists("Formulas.exe");
        if (!this.isPrepared && !useFormulas) {
            this.ns.tprint(`Server ${this.servername} is not prepared, cannot calculate threads without Formulas.exe`);
            return null;
        }
        const hackThreads = Math.floor(this.ns.hackAnalyzeThreads(this.servername, this.maxMoney * moneyStealFactor));
        let growThreads = Math.ceil(this.ns.growthAnalyze(this.servername, 1/(1-moneyStealFactor)));
        if (useFormulas){
            const server = this.ns.getServer(this.servername);
            server.hackDifficulty = server.minDifficulty;
            growThreads = this.ns.formulas.hacking.growThreads(server, this.ns.getPlayer(), this.maxMoney);
        }
        const weaken1Threads = Math.ceil(this.ns.hackAnalyzeSecurity(hackThreads) / securityDecreasePerWeaken);
        const weaken2Threads = Math.ceil(this.ns.growthAnalyzeSecurity(growThreads) / securityDecreasePerWeaken);

        const ramPerBatch = hackThreads * this.scriptRamHack + growThreads * this.scriptRamGrow + (weaken1Threads+weaken2Threads) * this.scriptRamWeaken;

        return { hackThreads, weaken1Threads, growThreads, weaken2Threads, ramPerBatch };
    }

    calculateDelays(resolveOffset) {
        const longestToolTime = Math.max(this.weakenTime, this.growTime, this.hackTime);
        const delayHack = longestToolTime - this.hackTime;
        const delayWeaken1 = longestToolTime - this.weakenTime + resolveOffset;
        const delayGrow = longestToolTime - this.growTime + resolveOffset * 2;
        const delayWeaken2 = longestToolTime - this.weakenTime + resolveOffset * 3;

        return { delayHack, delayWeaken1, delayGrow, delayWeaken2 };
    }

    calculatePrepInOneBatch() {
        //Calculate number of threads to reduce security to minimum
        const weaken1Threads = Math.ceil((this.securityLevel-this.minSecurity) / securityDecreasePerWeaken);
        //Calculate number of threads to grow money to maximum
        const moneyPercentage = this.money / this.maxMoney;
        const growThreads = Math.ceil(this.ns.growthAnalyze(this.servername, 1/moneyPercentage));
        //Calculate number of threads to reduce security to minimum again
        const weaken2Threads = Math.ceil(this.ns.growthAnalyzeSecurity(growThreads) / securityDecreasePerWeaken);
        const ramRequired = (weaken1Threads + weaken2Threads) * this.scriptRamWeaken + growThreads * this.scriptRamGrow;
        return {weaken1Threads, growThreads, weaken2Threads, ramRequired};
    }

    calculatePrepInMaxOneCycle(resolveOffset, maxBatches) {
        // Calculate thread and batchcount with UP TO batchesPerCycle batches
        const batches = Math.min(maxBatches, this.batchesPerCycle(resolveOffset));


        //Calculate number of threads to reduce security to minimum
        const securityDiff = this.securityLevel-this.minSecurity;
        let weaken1ThreadsTotal = Math.ceil(securityDiff / securityDecreasePerWeaken);
        const weaken1Threads = Math.ceil(weaken1ThreadsTotal / batches);


        //Calculate number of threads to grow money to maximum
        const moneyPercentage = this.money / this.maxMoney;
        let growThreadsTotal = Math.ceil(this.ns.growthAnalyze(this.servername, 1/moneyPercentage)); //TODO: Use Formulas.exe to optimize this for minSecurity
        const growThreads = Math.ceil(growThreadsTotal / batches);


        //Calculate number of threads to reduce security to minimum again
        const weaken2ThreadsTotal = Math.ceil(this.ns.growthAnalyzeSecurity(growThreadsTotal) / securityDecreasePerWeaken);
        const weaken2Threads = Math.ceil(weaken2ThreadsTotal / batches);

        const ramPerBatch = (weaken1Threads + weaken2Threads) * this.scriptRamWeaken + growThreads * this.scriptRamGrow;

        return {weaken1Threads, growThreads, weaken2Threads, ramPerBatch, batches};
    }

    //One batch is "hack, weaken, grow, weaken".
    // This function returns the minimum number of batches that need to be scheduled at all times to continuously hack the target.
    batchesPerCycle(resolveOffset) {
        const longestToolTime = Math.max(this.weakenTime, this.growTime, this.hackTime);
        return Math.floor(longestToolTime / (resolveOffset * 4));
    }

    // The amount of ram needed to continuously hack the target with no downtime.
    ramCostForFullCycle(resolveOffset) {
        return this.ramPerBatch * this.batchesPerCycle(resolveOffset);
    }

    optimalMoneyStealFactor(){
        // calculate maxDollarPerRam using ramCostForFullCycle and maxMoney (or moneyYield?)
    }

    static getAll(ns) {
        return getNetworkNodes(ns)
        .map(servername => new HackTarget(ns, servername))
        .sort((a, b) => b.maxMoney - a.maxMoney);
    }

    static getHackableSorted(ns, hackTargets, take) {
        const playerHackingLevel = ns.getHackingLevel();
        return hackTargets
            .filter(target => target.hasRootAccess && target.requiredHackLevel <= playerHackingLevel)
            .sort((a, b) => b.moneyYield - a.moneyYield)
            .slice(0, take);
    }
}

export class HackHost extends Server {
    // Permanent properties
    maxRam;

    // Dynamic properties
    get usedRam() { return this.ns.getServerUsedRam(this.servername); }
    get freeRam() { return this.maxRam - this.usedRam; }

    constructor(ns, servername) {
        super(ns, servername);
        this.maxRam = ns.getServerMaxRam(servername);
    }

    static getAll(ns) {
        return getNetworkNodes(ns)
            .map(servername => new HackHost(ns, servername))
            .sort((a, b) => b.maxRam - a.maxRam);
    }
}

let allNodes;
export function getNetworkNodes(ns) {
    if (allNodes) return allNodes;
    const startNode = "home";
    let visited = [startNode];
    let queue = ns.scan(startNode);

    while (queue.length > 0) {
        const node = queue.shift();
        visited.push(node);
        for (const neighbor of ns.scan(node)) {
            if (!visited.includes(neighbor)) {
                queue.push(neighbor);
            }
        }
    }
    allNodes = visited;
    return visited;
}