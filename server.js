class Server {
    _ns;

    // Permanent properties
    servername;
    requiredPorts;

    // Dynamic properties
    get hasRootAccess() { return this._ns.hasRootAccess(this.servername); }

    constructor(ns, servername) {
        this._ns = ns;
        this.servername = servername;
        this.requiredPorts = ns.getServerNumPortsRequired(servername);
    }

    crack() {
        const cracks = {
            "SQLInject.exe": this._ns.sqlinject,
            "HTTPWorm.exe": this._ns.httpworm,
            "relaySMTP.exe": this._ns.relaysmtp,
            "FTPCrack.exe": this._ns.ftpcrack,
            "BruteSSH.exe": this._ns.brutessh
        };
        for (const [tool, func] of Object.entries(cracks)) {
            if (this._ns.fileExists(tool)) {
                func(server);
            }
        }
        try {
            this._ns.nuke(server);
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


    // Dynamic properties
    get money() { return this._ns.getServerMoneyAvailable(this.servername); }
    get securityLevel() { return this._ns.getServerSecurityLevel(this.servername); }
    get isMinSecurity() { return this.securityLevel === this.minSecurity; }
    get isMaxMoney() { return this.money === this.maxMoney; }
    get isPrepared() { return this.isMinSecurity && this.isMaxMoney; }
    get growTime() { return this._ns.getGrowTime(this.servername); }
    get hackTime() { return this._ns.getHackTime(this.servername); }
    get weakenTime() { return this._ns.getWeakenTime(this.servername); }
    get ramPerBatch() {
        const threads = this.calculateThreads();
        const ramHack = threads.hackThreads * this.scriptRamHack;
        const ramWeaken = (threads.weaken1Threads + threads.weaken2Threads) * this.scriptRamWeaken;
        const ramGrow = threads.growThreads * this.scriptRamGrow;
        return ramHack + ramWeaken + ramGrow;
    }
    get moneyYield() {
        if(this._ns.fileExists("Formulas.exe")){
            const player = this._ns.getPlayer();
            const server = this._ns.getServer(this.servername);
            server.hackDifficulty = server.minDifficulty;
            return this.maxMoney * ns.formulas.hacking.hackChange(server, player);
        }
        else {
            // maxMoney * 1 if hackingLevel >= 3*requiredHackLevel, otherwise fall off to estimate reduced hackChance
            // No idea how accurate this is, but beginner guide said 3*requiredHackLevel is a good rule of thumb
            return this.maxMoney * Math.min(1, (1.33 - this.requiredHackLevel / this._ns.getHackingLevel()));
        }
    }

    constructor(ns, servername) {
        super(ns, servername);
        this.requiredHackLevel = ns.getServerRequiredHackingLevel(servername);
        this.maxMoney = ns.getServerMaxMoney(servername);
        this.minSecurity = ns.getServerMinSecurityLevel(servername);
    }

    calculateThreads() {
        const moneyStealFactor = 0.5; //TODO: Optimize this
        const hackThreads = Math.floor(this._ns.hackAnalyzeThreads(this.servername, money * moneyStealFactor));
        const growThreads = Math.ceil(this._ns.growthAnalyze(this.servername, 1/(1-moneyStealFactor)));
        const weaken1Threads = Math.ceil(this._ns.hackAnalyzeSecurity(hackThreads) / this._ns.weakenAnalyze(1));
        const weaken2Threads = Math.ceil(this._ns.growthAnalyzeSecurity(growThreads) / this._ns.weakenAnalyze(1));

        return { hackThreads, weaken1Threads, growThreads, weaken2Threads };
    }

    calculateDelays(resolveOffset) {
        const longestToolTime = Math.max(this.weakenTime, this.growTime, this.hackTime);
        const delayHack = longestToolTime - this.hackTime;
        const delayWeaken1 = longestToolTime - this.weakenTime + resolveOffset;
        const delayGrow = longestToolTime - this.growTime + resolveOffset * 2;
        const delayWeaken2 = longestToolTime - this.weakenTime + resolveOffset * 3;

        return { delayHack, delayWeaken1, delayGrow, delayWeaken2 };
    }

    calculatePrep() {
        //Calculate number of threads to reduce security to minimum
        const weaken1Threads = Math.ceil((this.securityLevel-this.minSecurity) / this._ns.weakenAnalyze(1));
        //Calculate number of threads to grow money to maximum
        const moneyPercentage = this.money / this.maxMoney;
        const growThreads = Math.ceil(this._ns.growthAnalyze(this.servername, 1/moneyPercentage));
        //Calculate number of threads to reduce security to minimum again
        const weaken2Threads = Math.ceil(this._ns.growthAnalyzeSecurity(growThreads) / this._ns.weakenAnalyze(1));
        const ramRequired = (weaken1Threads + weaken2Threads) * this.scriptRamWeaken + growThreads * this.scriptRamGrow;
        return {weaken1Threads, growThreads, weaken2Threads, ramRequired};
    }

    //One batch is "hack, weaken, grow, weaken".
    // This function returns the minimum number of batches that need to be scheduled at all times to continuously hack the target.
    batchesPerCycle(resolveOffset) {
        const longestToolTime = Math.max(this.weakenTime, this.growTime, this.hackTime);
        return Math.floor(longestToolTime / (resolveOffset * 4));
    }

    static getAll(ns) {
        return getNetworkNodes(ns).map(servername => new HackTarget(ns, servername));
    }

    static getHackableSorted(ns, take) {
        const playerHackingLevel = ns.getHackingLevel();
        return HackTarget.getAll(ns)
            .filter(target => target.requiredHackLevel <= playerHackingLevel)
            .sort((a, b) => b.moneyYield - a.moneyYield)
            .slice(0, take);
    }
}

export class HackHost extends Server {
    // Permanent properties
    maxRam;

    // Dynamic properties
    get usedRam() { return this._ns.getServerUsedRam(this.servername); }
    get freeRam() { return this.maxRam - this.usedRam; }

    constructor(ns, servername) {
        super(ns, servername);
        this.maxRam = ns.getServerMaxRam(servername);
    }

    static getAll(ns) {
        return getNetworkNodes(ns).map(servername => new HackHost(ns, servername));
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