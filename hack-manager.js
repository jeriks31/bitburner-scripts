import {HackHost, HackTarget} from "./server";

/** @type import(".").NS */
let ns = null;

// Globals
const resolveOffset = 500; // Time (ms) between resolution of HWGW scripts (e.g. 500 => first weaken finishes 500ms after hack)
const maxBatches = 40; // Maximum number of batches to schedule per target. Increasing this will increase risk of desync/misfires and use more RAM
const verbose = true; // Set to true to enable extra logging for debugging
const mainLoopDelay = 5000; // Time (ms) between main loop iterations
let maxTargets = 1;
let hackHosts = [];
let hackTargets = [];

export async function main(_ns) {
    ns = _ns;
    if (!validationCheck()) return;

    hackHosts = HackHost.getAll(ns);
    hackTargets = HackTarget.getHackableSorted(ns, maxTargets); //TODO: this will need to be updated at some point without losing the current object instances

    while (true) {
        await tryScheduleHackBatches();

        await ns.sleep(mainLoopDelay);
    }
}

async function tryScheduleHackBatches(){

    for (const target of hackTargets) {
        if (Date.now() < target.scheduledUntil){
            if (verbose)
                ns.tprint(`Skipping ${target.servername}, already scheduled until ${new Date(target.scheduledUntil).toISOString()}`);
            continue;
        }

        let scheduledBatches = 0;
        const delays = target.calculateDelays(resolveOffset);
        if (!target.isPrepared){
            if (target.isPrepping){
                if (verbose) ns.tprint(`Skipping prep for ${target.servername}, already prepping`);
                continue;
            }
            const prep = target.calculatePrepInMaxOneCycle(resolveOffset, maxBatches);
            if (verbose) ns.tprint(`Prep ${target.servername}: ramPerBatch=${prep.ramPerBatch}GB, w1ThreadsPerBatch=${prep.w1ThreadsPerBatch}, growThreadsPerBatch=${prep.growThreadsPerBatch}, w2ThreadsPerBatch=${prep.w2ThreadsPerBatch}`);
            while (scheduledBatches < prep.batches){
                const host = hackHosts.find(host => host.freeRam >= prep.ramPerBatch);
                if (host) {
                    ns.scp("external/grow.js", host.servername);
                    ns.scp("external/weaken.js", host.servername);
                    const toBeScheduledForThisHost = Math.min(host.freeRam / prep.ramPerBatch, prep.batches);
                    let scheduledForThisHost = 0;
                    while (scheduledForThisHost < toBeScheduledForThisHost){
                        const cycleOffset = scheduledBatches * resolveOffset * 4;
                        if (prep.w1ThreadsPerBatch > 0)
                            ns.exec("external/weaken.js", host.servername, prep.w1ThreadsPerBatch, target.servername, cycleOffset + delays.delayWeaken1, `Prep-${scheduledBatches}-w1`, verbose);
                        if (prep.growThreadsPerBatch > 0)
                            ns.exec("external/grow.js", host.servername, prep.growThreadsPerBatch, target.servername, cycleOffset + delays.delayGrow, `Prep-${scheduledBatches}-g2`, verbose);
                        if (prep.w2ThreadsPerBatch > 0)
                            ns.exec("external/weaken.js", host.servername, prep.w2ThreadsPerBatch, target.servername, cycleOffset + delays.delayWeaken2, `Prep-${scheduledBatches}-w3`, verbose);
                        scheduledForThisHost++;
                        scheduledBatches++; // Must be incremented here, not in the outer loop, because it is used by cycleOffset and the script names ^^^
                    }
                }
                else{
                    ns.tprint(`Scheduled ${scheduledBatches}/${prep.batches} PREP-batches for ${target.servername}, no more available hosts`);
                    break;
                }
            }
            if (scheduledBatches >= prep.batches){
                target.preppingUntil = Date.now() + (scheduledBatches * resolveOffset * 4) + target.longestToolTime;
            }
            continue; // Go to next target while preparing this one
        }

        const threads = target.calculateThreads();
        while (scheduledBatches < maxBatches){
            const host = hackHosts.find(host => host.freeRam >= target.ramPerBatch);
            if (host) {
                ns.scp("external/hack.js", host.servername);
                ns.scp("external/weaken.js", host.servername);
                ns.scp("external/grow.js", host.servername);
                const toBeScheduledForThisHost = Math.min(host.freeRam / target.ramPerBatch, (maxBatches - scheduledBatches));
                let scheduledForThisHost = 0;
                while(scheduledForThisHost < toBeScheduledForThisHost){
                    const cycleOffset = scheduledBatches * resolveOffset * 4;
                    ns.exec("external/hack.js", host.servername, threads.hackThreads, target.servername, cycleOffset + delays.delayHack, `Batch-${scheduledBatches}-h0`, verbose);
                    ns.exec("external/weaken.js", host.servername, threads.weaken1Threads, target.servername, cycleOffset + delays.delayWeaken1, `Batch-${scheduledBatches}-w1`, verbose);
                    ns.exec("external/grow.js", host.servername, threads.growThreads, target.servername, cycleOffset + delays.delayGrow, `Batch-${scheduledBatches}-g2`, verbose);
                    ns.exec("external/weaken.js", host.servername, threads.weaken2Threads, target.servername, cycleOffset + delays.delayWeaken2, `Batch-${scheduledBatches}-w3`, verbose);
                    scheduledForThisHost++;
                    scheduledBatches++;
                }
            }
            else{
                ns.tprint(`Scheduled ${scheduledBatches}/${maxBatches} batches for ${target.servername}, no more available hosts`);
                break;
            }
        }
        target.scheduledUntil = Date.now() + (scheduledBatches * resolveOffset * 4);
    }
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