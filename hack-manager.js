import {HackHost, HackTarget} from "./server";

// Globals
const resolveOffset = 500; // Time (ms) between resolution of HWGW scripts (e.g. 500 => first weaken finishes 500ms after hack)
const maxBatches = 40; // Maximum number of batches to schedule per target. Increasing this will increase risk of desync/misfires and use more RAM
const verbose = true; // Set to true to enable extra logging for debugging
const mainLoopDelay = 5000; // Time (ms) between main loop iterations
let maxTargets = 1;

export async function main(ns) {
    if (!validationCheck(ns)) return;

    while (true) {
        tryScheduleHackBatches();

        await ns.sleep(mainLoopDelay);
    }
}

function tryScheduleHackBatches(){
    let hackHosts = HackHost.getAll(ns);
    let hackTargets = HackTarget.getHackableSorted(ns, maxTargets);

    for (const target of hackTargets) {
        if (Date.now() < target.scheduledUntil){
            if (verbose)
                ns.tprint(`Skipping ${target.servername}, already scheduled until ${new Date(target.scheduledUntil).toISOString()}`);
            continue;
        }
        let batchCount = 0;
        const delays = target.calculateDelays(resolveOffset);
        if (!target.isPrepared){
            //TODO: More optimized preparation, this requires a lot of RAM
            const prep = target.calculatePrep();
            ns.tprint(`Prepping ${target.servername} requires ${prep.ramRequired} RAM`);
            const host = hackHosts.find(host => host.freeRam >= prep.ramRequired);
            if (host) {
                ns.scp("external/grow.js", host.servername);
                ns.scp("external/weaken.js", host.servername);
                ns.exec("external/weaken.js", host.servername, prep.weaken1Threads, target.servername, delays.delayWeaken1, `Prep-w1`, verbose);
                ns.exec("external/grow.js", host.servername, prep.growThreads, target.servername, delays.delayGrow, `Prep-g2`, verbose);
                ns.exec("external/weaken.js", host.servername, prep.weaken2Threads, target.servername, delays.delayWeaken2, `Prep-w3`, verbose);
            }
            else{
                ns.tprint(`Failed to prepare ${target.servername}, no available hosts`);
            }
            continue;
        }

        const threads = target.calculateThreads();
        while (batchCount < maxBatches){
            const host = hackHosts.find(host => host.freeRam >= target.ramPerBatch);
            if (host) {
                ns.scp("external/hack.js", host.servername);
                ns.scp("external/weaken.js", host.servername);
                ns.scp("external/grow.js", host.servername);
                const batchesForThisHost = Math.min(host.freeRam / target.ramPerBatch, maxBatches);
                while(batchCount < batchesForThisHost){
                    const cycleOffset = batchCount * resolveOffset * 4;
                    ns.exec("external/hack.js", host.servername, threads.hackThreads, target.servername, cycleOffset + delays.delayHack, `Batch-${batchCount}-h0`, verbose);
                    ns.exec("external/weaken.js", host.servername, threads.weaken1Threads, target.servername, cycleOffset + delays.delayWeaken1, `Batch-${batchCount}-w1`, verbose);
                    ns.exec("external/grow.js", host.servername, threads.growThreads, target.servername, cycleOffset + delays.delayGrow, `Batch-${batchCount}-g2`, verbose);
                    ns.exec("external/weaken.js", host.servername, threads.weaken2Threads, target.servername, cycleOffset + delays.delayWeaken2, `Batch-${batchCount}-w3`, verbose);
                    batchCount++;
                }
            }
            else{
                ns.tprint(`Scheduled ${batchCount}/${maxBatches} batches for ${target.servername}, no more available hosts`);
                break;
            }
        }
        target.scheduledUntil = Date.now() + (batchCount * resolveOffset * 4);
    }
}

function validationCheck(ns){
    if (ns.getServerName() !== "home"){
        ns.tprint("This script should be run from the home server");
        return false;
    }
    const scriptName = ns.getScriptName();
    if (ns.scriptRunning(scriptName, "home")){
        ns.tprint(`${scriptName} is already running on home`);
        return false;
    }
    return true;
}