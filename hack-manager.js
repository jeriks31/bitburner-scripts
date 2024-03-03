import {HackHost, HackTarget} from "./server";

/** @type import(".").NS */
let ns = null;
const infiniteLoopDebug = false;

// Globals
const resolveOffset = 500; // Time (ms) between resolution of HWGW scripts (e.g. 500 => first weaken finishes 500ms after hack)
const scheduleStartOffset = 1000; // All hack/weak/grow scripts are delayed by this amount in case starting the hack/grow/weak script takes a few ms of time.
const maxBatches = 60; // Maximum number of batches to schedule per target. Increasing this will increase risk of desync/misfires and use more RAM
const verbose = true; // Set to true to enable extra logging for debugging
const mainLoopDelay = 10000; // Time (ms) between main loop iterations
let maxTargets = 2;
let hackHosts = [];
let hackTargets = [];

export async function main(_ns) {
    ns = _ns;
    if (!validationCheck()) return;

    hackHosts = HackHost.getAll(ns);
    hackTargets = HackTarget.getAll(ns);

    exportScripts()

    while (true) {
        if (infiniteLoopDebug ){ns.tprint(1); await ns.sleep(500);}
        await tryScheduleHackBatches();

        await ns.sleep(mainLoopDelay);
    }
}

async function tryScheduleHackBatches(){
    const hackableTargets = HackTarget.getHackableSorted(ns, hackTargets, maxTargets);
    for (const target of hackableTargets) {
        if (infiniteLoopDebug ){ns.tprint(0); await ns.sleep(500);}
        if (Date.now() < target.scheduledUntil){
            //if (verbose) ns.tprint(`Skipping ${target.servername}, already scheduled until ${new Date(target.scheduledUntil).toISOString()}`);
            continue;
        }

        let scheduledBatches = 0;
        const delays = target.calculateDelays(resolveOffset);
        if (!target.isPrepared){
            if (target.isPrepping) continue; // Already prepping, skip
            
            await executeHWGW(target, true);

            continue; // Go to next target while preparing this one
        }

        await executeHWGW(target, false);
    }
}

async function executeHWGW(target, isPrep){
    const delays = target.calculateDelays(resolveOffset);
    const threads = isPrep
        ? target.calculatePrepInMaxOneCycle(resolveOffset, maxBatches)
        : calculateThreadsWithOptimalMoneyStealFactor(target);
    const targetBatchCount = isPrep ? threads.batches : maxBatches;
    const namePrefix = isPrep ? "Prepp" : "Batch"; // Intentional typo to have same char count
    const scheduleStartTime = Date.now() + scheduleStartOffset;

    if (verbose) ns.tprint(`Processing ${target.servername}: ramPerBatch=${threads.ramPerBatch}GB, hackThreads=${threads.hackThreads} weaken1Threads=${threads.weaken1Threads}, growThreads=${threads.growThreads}, weaken2Threads=${threads.weaken2Threads}`);

    let scheduledBatches = 0;
    while (scheduledBatches < targetBatchCount){
        if (infiniteLoopDebug ){ns.tprint("executeHWGW outer"); await ns.sleep(500);}

        const host = hackHosts.find(host => host.hasRootAccess && host.freeRam >= threads.ramPerBatch);
        if (!host) break; // No more available hosts, early exit

        const toBeScheduledForThisHost = Math.min(host.freeRam / threads.ramPerBatch, (targetBatchCount - scheduledBatches));
        let scheduledForThisHost = 0;
        while(scheduledForThisHost < toBeScheduledForThisHost){
            if (infiniteLoopDebug ){ns.tprint("executeHWGW inner"); await ns.sleep(500);}

            const batchOffset = scheduledBatches * resolveOffset * 4; // This batch should be scheduled to start this far into the future compared to the first batch
            const baseScheduleStart = scheduleStartTime + batchOffset; // The first script of this batch should start at this time
            if (threads.hackThreads) // Prep has no hackThreads
                ns.exec("external/hack.js", host.servername, threads.hackThreads, target.servername, baseScheduleStart + delays.delayHack, `${namePrefix}-${scheduledBatches}-HACK `, verbose);
            if (threads.weaken1Threads) // Prep sometimes has no weaken1Threads
                ns.exec("external/weaken.js", host.servername, threads.weaken1Threads, target.servername, baseScheduleStart + delays.delayWeaken1, `${namePrefix}-${scheduledBatches}-WEAK1`, verbose);
            ns.exec("external/grow.js", host.servername, threads.growThreads, target.servername, baseScheduleStart + delays.delayGrow, `${namePrefix}-${scheduledBatches}-GROW `, verbose);
            ns.exec("external/weaken.js", host.servername, threads.weaken2Threads, target.servername, baseScheduleStart + delays.delayWeaken2, `${namePrefix}-${scheduledBatches}-WEAK2`, verbose);
            scheduledForThisHost++;
            scheduledBatches++;
        }
    }

    if (verbose) ns.tprint(`Scheduled ${scheduledBatches}/${targetBatchCount} batches for ${target.servername}`);
    target.scheduledUntil = scheduleStartTime + (scheduledBatches * resolveOffset * 4) + resolveOffset;
    if (isPrep)
        target.preppingUntil = scheduleStartTime + (scheduledBatches * resolveOffset * 4) + target.longestToolTime;
}

/** @param {HackTarget} target */
function calculateThreadsWithOptimalMoneyStealFactor(target){
    // 1. try to get the highest possible moneyStealFactor (up to max 0.5) while still having enough totalNetworkRam to continuously hack full cycle
    // 2. if we can't continuously hack with moneyStealFactor of 0.01 then just hack as much as possible with 0.01, don't go lower.

    var networkRam = getTotalNetworkRam();
    var batchesPerCycle = target.batchesPerCycle(resolveOffset);

    let t;
    for (let i = 0.5; i >= 0; i -= 0.05){
        let moneyStealFactor = Math.max(i, 0.01);
        t = target.calculateThreads(moneyStealFactor);
        ns.tprint(`Target=${target.servername}, moneyStealFactor=${moneyStealFactor}, threads={h:${t.hackThreads}, w1:${t.weaken1Threads}, g:${t.growThreads}, w2:${t.weaken2Threads}}, ramPerBatch=${t.ramPerBatch}`);
        if (batchesPerCycle * t.ramPerBatch < networkRam.max * 0.5){
            ns.tprint("Optimal moneyStealFactor found: " + moneyStealFactor)
            break;
        }
    }
    return t;
}

function exportScripts(){
    for (const host of hackHosts){
        ns.scp("external/hack.js", host.servername);
        ns.scp("external/weaken.js", host.servername);
        ns.scp("external/grow.js", host.servername);
    }
}

function getTotalNetworkRam(){
    let free = 0; let max = 0;
    for (const host of hackHosts){
        if (host.hasRootAccess){
            free += host.freeRam;
            max += host.maxRam;
        }
    }
    return {free, max}
}

function validationCheck(){
    if (ns.getHostname() !== "home"){
        ns.tprint("This script should be run from the home server");
        return false;
    }
    const processes = ns.ps();
    const scriptName = ns.getScriptName();
    if (processes.filter(p => p.filename == scriptName).length > 1 ){
        ns.tprint(`${scriptName} is already running on home`);
        return false;
    }
    return true;
}