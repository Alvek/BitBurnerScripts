import { WorkerPort, BuyTorOrProgPort, EnterFactionOrBackdoorPort } from "Const.ts";

const MultStep: number = 0.01;
const MultStepStart: number = -0.5 + MultStep;
const Weaken1Name = "weak.js";
const Weaken2Name = "weak2.js";
const GrowName = "grow.js";
const HackName = "hack.js";
const InstallBackDoor = "backdoor.ts";
const BuyProg = "buyprog.ts";
const BuyTor = "buyTor.ts";
const EnterFaction = "joinFaction.ts";
const MaxWorkerCount = 50_000;
const MaxPrepTime = 300;
const PrintWorkerLog = false;
const PrintMasterLog = false;
const TPrintBatchRun = true;
const SortAsPrepeared = true;
const TimePerSingleExec = 3.7;


/** @param {NS} ns **/
export async function main(ns: NS) {
  debugger;
  DisableLog(ns);
  let prepareScriptPid: [string, number][] = [];
  let scanned = false;
  let servDTO: ServerDTO[] = [];
  let checkPreStart = true;
  let prepearingInProgress = false;
  let preStartProcList: [string, number][] = [];
  let anyPreped = false;
  let ownedServers = ns.getPurchasedServers().length;
  const progData = new ProgData();
  const backdoorStatus = new BackDoorServersStatus();
  while (true) {
    let player = ns.getPlayer();
    if (ownedServers != 25 && ownedServers != ns.getPurchasedServers().length) {
      scanned = false;
      ownedServers = ns.getPurchasedServers().length;
    }
    if (!progData.Deep1[2]) {
      scanned = false;
      progData.Deep1[2] = true;
    }
    if (!progData.Deep2[2]) {
      scanned = false;
      progData.Deep2[2] = true;
    }
    if (!scanned) {
      let servers: string[] = [];
      let serversToScan = ns.scan("home");
      servDTO = [];
      servDTO.push(new ServerDTO());
      servDTO[0].server = ns.getServer("home");
      serversToScan = serversToScan.concat(ns.scan("home"));
      while (serversToScan.length > 0) {
        let server = serversToScan.shift() as string;
        if (!servers.includes(server) && server !== "home") {
          servers.push(server);
          let newItem = new ServerDTO();
          newItem.server = ns.getServer(server);
          servDTO.push(newItem);
          serversToScan = serversToScan.concat(ns.scan(server));
          ns.scp([
            Weaken1Name,
            Weaken2Name,
            GrowName,
            HackName
          ], server);
        }
      }
      scanned = true;
    }
    if (!progData.AllBought)
      await BuyPrograms(ns, progData, player);
    if (checkPreStart) {
      let res = CheckPreStartScripts(ns, servDTO, preStartProcList);
      preStartProcList = res[1];
      checkPreStart = res[0];
    }
    else {
      prepearingInProgress = !CheckIfPrepeareFinished(ns, prepareScriptPid);
      if (!prepearingInProgress)
        preStartProcList = [];
    }
    ClearValuesForServer(servDTO);
    OpenPortsAndUpdateServerInfo(ns, servDTO, progData, player);
    if (!backdoorStatus.AllDone) {
      for (let item of backdoorStatus.backdoorServerList)
        InstallBackDoors(ns, item, player);
    }
    let totalAvailableThreads = 0;
    for (let server of servDTO) {
      totalAvailableThreads = CalculateRunningThreadsForServer(ns, server, totalAvailableThreads);
    }
    servDTO.sort((a, b) => SortCompareServers(ns, a, b, player, totalAvailableThreads));
    if (!servDTO.some((a) => !a.needPrep && (a.server?.moneyMax ?? 0) > 0)) {
      let noodlesServ = servDTO.find((a) => a.server.hostname == "n00dles") ?? servDTO[0];
      if (noodlesServ.needPrep && !prepearingInProgress) {
        const prepRes = PrepServerBatch(ns, noodlesServ, servDTO, prepareScriptPid, player);
        prepearingInProgress = true;
        anyPreped = false;
        totalAvailableThreads -= prepRes[0];
        await ns.sleep(0);
      }
    }
    else { anyPreped = true; }
    if (!anyPreped) {
      await ns.sleep(0);
      if (PrintMasterLog)
        ns.tprint("Waiting any prep");
      continue;
    }
    else if (player.skills.hacking > 100 && player.skills.hacking < 500) {
      let joeServ = servDTO.find((a) => a.server.hostname == "joesguns") ?? servDTO[0];
      if (joeServ.needPrep && !prepearingInProgress) {
        const prepRes = PrepServerBatch(ns, joeServ, servDTO, prepareScriptPid, player);
        totalAvailableThreads -= prepRes[0];
        prepearingInProgress = true;
        await ns.sleep(0);
        continue;
      }
    }
    else if (player.skills.hacking > 500 && player.skills.hacking < 1000) {
      let joeServ = servDTO.find((a) => a.server.hostname == "joesguns") ?? servDTO[0];
      if (joeServ.needPrep && !prepearingInProgress) {
        const prepRes = PrepServerBatch(ns, joeServ, servDTO, prepareScriptPid, player);
        totalAvailableThreads -= prepRes[0];
        prepearingInProgress = true;
        await ns.sleep(0);
        continue;
      }
    }
    else if (player.skills.hacking > 1000) {
      let joeServ = servDTO.find((a) => a.server.hostname == "phantasy") ?? servDTO[0];
      if (joeServ.needPrep && !prepearingInProgress) {
        const prepRes = PrepServerBatch(ns, joeServ, servDTO, prepareScriptPid, player);
        totalAvailableThreads -= prepRes[0];
        prepearingInProgress = true;
        await ns.sleep(0);
        continue;
      }
    }
    if (PrintMasterLog)
      ns.tprint("Cycle start");
    let batchCount = 0;
    let switchToPrep = false;

    //todo copy pred proc ID to localStorage to survive restart and avoid multi prep
    if (player.skills.hacking > 30 && !prepearingInProgress) {
      let offset = servDTO.findIndex((a) => a.needPrep)
      if ((servDTO[offset].bacthInfo.totalTime > (TimePerSingleExec * Math.max(1, Math.floor(servDTO[0].bacthInfo.totalThreads / totalAvailableThreads) + 1000)))) {
        while (offset < servDTO.length && !(switchToPrep = CalculateIfNextTargetIsBetter(ns, totalAvailableThreads, servDTO[0], servDTO[offset], player))) {
          if (!servDTO[offset + 1].needPrep) {
            while (offset < servDTO.length && (!servDTO[offset].needPrep || servDTO[offset].server.purchasedByPlayer)) {
              offset++
            }
          }
          else { offset++; }
        }
      } else {
        const timePerBatch = TimePerSingleExec * Math.max(1, Math.floor(servDTO[0].bacthInfo.totalThreads / totalAvailableThreads)) + 1000;
        const item = GetBestTargetWithTime(ns, totalAvailableThreads, servDTO, player, timePerBatch);
        if (item)
          offset = servDTO.indexOf(item);
        else {
          ns.tprint("No server with better time");
          ns.exit();
        }
      }
      let prepTarget = servDTO[offset];
      if (switchToPrep && prepTarget && (preStartProcList.length == 0 || (preStartProcList.length > 0 && !preStartProcList.some(([str, num]) => str == prepTarget.server.hostname)))) {
        const prepStats = PrepServerBatch(ns, prepTarget, servDTO, prepareScriptPid, player);
        totalAvailableThreads -= prepStats[0];
        prepearingInProgress = true;
        switchToPrep = false;
        if (TPrintBatchRun) ns.tprint(`Launched additional prep: ${prepTarget.server.hostname},totalThreads: ${prepStats[0]}, prepTime: ${prepStats[1]}`);
      }
    }
    if (servDTO[0].needPrep) {
      ns.tprint("Desync:" + servDTO[0].server.hostname);
      ns.exit();
    }
    for (const servInfo of servDTO) {
      if (totalAvailableThreads == 0 || batchCount != 0)
        break;
      if ((checkPreStart && !preStartProcList.some(([str, num]) => str == servInfo.server.hostname)) || servInfo.needPrep) {
        continue;
      }
      if (totalAvailableThreads >= servInfo.bacthInfo.totalThreads) {
        if (servInfo.server.moneyMax != 0 && servInfo.server.hasAdminRights &&
          totalAvailableThreads > 0 && (servInfo.server.hackDifficulty ?? 0) < player.skills.hacking) {
          const startTime = performance.now();
          let startTimeUpdated = performance.now();
          while (totalAvailableThreads >= servInfo.bacthInfo.totalThreads) {
            if (performance.now() - startTimeUpdated > 200) {
              startTimeUpdated = performance.now();
              await ns.sleep(15);
            }
            let needToWritePort = false;
            const breakAndStop = (batchCount > MaxWorkerCount) || (performance.now() - startTime > servInfo.bacthInfo.totalTime - (servInfo.bacthInfo.totalTime / 10));
            if (breakAndStop ||
              (totalAvailableThreads - servInfo.bacthInfo.totalThreads < servInfo.bacthInfo.totalThreads)
              || (totalAvailableThreads == servInfo.bacthInfo.totalThreads)) {
              needToWritePort = true;
              if (PrintMasterLog)
                ns.tprint("enable write port");
            }
            batchCount++;
            let launchedCount = RunScriptsForTarget(ns, HackName, servInfo.server.hostname, servInfo.bacthInfo.hackThreadCount, servDTO, servInfo.bacthInfo.hackDelay, prepareScriptPid);
            totalAvailableThreads -= launchedCount;
            launchedCount = RunScriptsForTarget(ns, Weaken1Name, servInfo.server.hostname, servInfo.bacthInfo.weaken1ThreadCount, servDTO, servInfo.bacthInfo.weaken1Delay, prepareScriptPid);
            totalAvailableThreads -= launchedCount;
            launchedCount = RunScriptsForTarget(ns, GrowName, servInfo.server.hostname, servInfo.bacthInfo.growThreadCount, servDTO, servInfo.bacthInfo.growDelay, prepareScriptPid);
            totalAvailableThreads -= launchedCount;
            launchedCount = RunScriptsForTarget(ns, Weaken2Name, servInfo.server.hostname, servInfo.bacthInfo.weaken2ThreadCount, servDTO, servInfo.bacthInfo.weaken2Delay, prepareScriptPid, false, needToWritePort);
            totalAvailableThreads -= launchedCount;
            if (launchedCount == 0) {
              if (PrintMasterLog)
                ns.tprint("Zero launnched: " + servInfo.server.hostname);
            }
            if (breakAndStop)
              break;
          }
          if (PrintMasterLog)
            ns.tprint("Finishedd launch: " + servInfo.server.hostname);
          if (totalAvailableThreads > servInfo.bacthInfo.totalThreads) {
            ns.tprint("Have threads for more baatchs after finish: " + servInfo.server.hostname);
          }
        }
      }
      else if (totalAvailableThreads == 0) {
        if (PrintMasterLog) ns.tprint("ending while");
        break;
      }
    }
    if (PrintMasterLog)
      ns.tprint(`Cycle end, batch started: ${batchCount}, threadPerBatch: ${servDTO[0].bacthInfo.totalThreads}`);
    if (TPrintBatchRun && (!prepearingInProgress && totalAvailableThreads == 0)) {
      ns.tprint(`FreeThreads: ${totalAvailableThreads},batches: ${batchCount}, threadPerBatch: ${servDTO[0].bacthInfo.totalThreads}`);
    }
    if (batchCount != 0) {
      await ns.nextPortWrite(WorkerPort);
      ns.clearPort(WorkerPort);
    }
    else { await ns.sleep(0); }
  }
}

function DisableLog(ns: NS) {
  ns.disableLog("disableLog");
  ns.disableLog("ftpcrack");
  ns.disableLog("sqlinject");
  ns.disableLog("relaysmtp");
  ns.disableLog("httpworm");
  ns.disableLog("brutessh");
  ns.disableLog("nuke");
  ns.disableLog("scp");
  ns.disableLog("scan");
  ns.disableLog("sleep");
}
function CalculateIfNextTargetIsBetter(ns: NS, freeTrheads: number, currentTarget: ServerDTO, nextTarget: ServerDTO, player: Player): boolean {
  let res = false;
  if (nextTarget.server.hasAdminRights) {
    const totalCurrentBatchProfit = Math.floor(freeTrheads / currentTarget.bacthInfo.totalThreads) * currentTarget.bacthInfo.totalThreads * currentTarget.bestMultValuePerThread;
    const nextCurrentBatchProfit = Math.floor(freeTrheads / nextTarget.bacthInfo.totalThreads) * nextTarget.bacthInfo.totalThreads * nextTarget.bestMultValuePerThread;
    if (totalCurrentBatchProfit < nextCurrentBatchProfit) {
      const temp = CalculatePrepNeeded(ns, nextTarget, player);
      const prepTreadsTotal = temp[0] + temp[1] + temp[2];
      const totalTimePrepPerRun = Math.max(temp[3], temp[4], temp[5]);
      const totalPrepTime = Math.max(1, Math.floor(prepTreadsTotal / freeTrheads)) * totalTimePrepPerRun;
      const moneyLostOnCurrentTarget = totalPrepTime / currentTarget.bacthInfo.totalTime * totalCurrentBatchProfit
      const moneyGainedDuringPrepOnNextTarget = totalPrepTime / nextTarget.bacthInfo.totalTime * nextCurrentBatchProfit;
      if ((prepTreadsTotal < freeTrheads && totalPrepTime / 1000 < MaxPrepTime * 2) || (totalPrepTime / 1000 < MaxPrepTime && moneyLostOnCurrentTarget < moneyGainedDuringPrepOnNextTarget))
        res = true;
    }
  }
  return res;
}
function GetBestTargetWithTime(ns: NS, freeTrheads: number, servDTO: ServerDTO[], player: Player, timeToRunBatch: number): ServerDTO | undefined {
  const filteredList = servDTO.filter((a) => a.bacthInfo.totalTime > timeToRunBatch + 1000);
  let res = undefined;
  for (let item of filteredList) {
    const temp = CalculatePrepNeeded(ns, item, player);
    const prepTreadsTotal = temp[0] + temp[1] + temp[2];
    const totalTimePrepPerRun = Math.max(temp[3], temp[4], temp[5]);
    const totalPrepTime = Math.max(1, Math.floor(prepTreadsTotal / freeTrheads)) * totalTimePrepPerRun;

    if (totalPrepTime / 1000 < MaxPrepTime) {
      res = item;
      break;
    }
  }
  return res;
}
function PrepServerBatch(ns: NS, server: ServerDTO, availableServers: ServerDTO[], prepareScriptPid: [string, number][], player: Player): [number, number] {
  const temp = CalculatePrepNeeded(ns, server, player);
  const weak1threads = temp[0];
  const weak2threads = temp[1];
  const growthreads = temp[2];
  const weak1Time = temp[3];
  const weak2Time = temp[4];
  const growTime = temp[5];

  const maxTime: number = Math.max(weak1Time, growTime, weak2Time);
  let delay: number = maxTime - weak1Time;
  let launched: number = RunScriptsForTarget(ns, Weaken1Name, server.server.hostname, weak1threads, availableServers, delay, prepareScriptPid, true);
  delay = maxTime - growTime;
  launched += RunScriptsForTarget(ns, GrowName, server.server.hostname, growthreads, availableServers, delay, prepareScriptPid, true);
  delay = maxTime - weak2Time;
  launched += RunScriptsForTarget(ns, Weaken2Name, server.server.hostname, weak2threads, availableServers, delay, prepareScriptPid, true);
  return [launched, Math.max(weak1Time, weak2Time, growTime)];
}
function CalculatePrepNeeded(ns: NS, server: ServerDTO, player: Player): [number, number, number, number, number, number] {
  let weak1threads = 0;
  let growthreads = 0;
  let weak2threads = 0;
  let weak1Time = 0;
  let growTime = 0;
  let weak2Time = 0;
  let cloneServ = CreateMockServer(ns, server.server);
  if (cloneServ.hackDifficulty != cloneServ.minDifficulty && cloneServ.hackDifficulty && cloneServ.minDifficulty) {
    let threadNeeded = Math.ceil((cloneServ.hackDifficulty - cloneServ.minDifficulty) / ns.weakenAnalyze(1, 1));
    weak1threads = threadNeeded;
    weak1Time = ns.formulas.hacking.weakenTime(cloneServ, player);
    if (PrintWorkerLog) {
      ns.tprint("Weak1Time: " + weak1Time);
      ns.tprint("SecLvl: " + cloneServ.hackDifficulty);
    }
    //cloneServ.hackDifficulty = cloneServ.minDifficulty;
  }
  if (cloneServ.moneyMax != cloneServ.moneyAvailable && cloneServ.minDifficulty && cloneServ.moneyMax && cloneServ.hackDifficulty) {
    let threadNeeded = Math.ceil(ns.formulas.hacking.growThreads(cloneServ, player, cloneServ.moneyMax, 1));
    growthreads = threadNeeded;
    growTime = ns.formulas.hacking.growTime(cloneServ, player);
    if (PrintWorkerLog) {
      ns.tprint("GrowTime: " + growTime);
      ns.tprint("Money: " + cloneServ.moneyAvailable);
    }

    //cloneServ.hackDifficulty = cloneServ.minDifficulty + growthreads * 0.004;
    cloneServ.hackDifficulty = cloneServ.minDifficulty + growthreads * 0.004;
    weak2Time = ns.formulas.hacking.weakenTime(cloneServ, ns.getPlayer());
    if (PrintWorkerLog) {
      ns.tprint("Weak2Time: " + weak2Time);
    }
    weak2threads = Math.ceil((cloneServ.hackDifficulty - cloneServ.minDifficulty) / ns.weakenAnalyze(1, 1));
  }
  return [weak1threads, weak2threads, growthreads, weak1Time, weak2Time, growTime];
}
function RunScriptsForTarget(ns: NS, scriptName: string, target: string,
  threadCount: number, availableServers: ServerDTO[], delay: number,
  prepareScriptPid: [string, number][],
  prepareScript: boolean = false, writeToPort = false): number {
  let threadStarted = 0;
  let needToWrite = false;
  if (threadCount > 0) {
    let threadsToRun = threadCount;
    for (let servInfo of availableServers) {
      if (servInfo.threadsAvailable > 0) {
        if (threadsToRun <= servInfo.threadsAvailable) {
          if (writeToPort) {
            needToWrite = true;
          }

          let launchedPid = ns.exec(scriptName, servInfo.server.hostname, threadsToRun, target, delay, PrintWorkerLog, writeToPort, needToWrite);
          if (launchedPid == 0) {
            ns.print("ThreadToLaunchOnserver: " + threadsToRun + "; " + (servInfo.server.maxRam - servInfo.server.ramUsed))
          }
          else if (prepareScript) {
            prepareScriptPid.push([servInfo.server.hostname, launchedPid]);
          }
          threadStarted += threadsToRun;
          servInfo.threadsAvailable -= threadsToRun;
          threadsToRun = 0;
        }
        else {
          let launchedPid = ns.exec(scriptName, servInfo.server.hostname, servInfo.threadsAvailable, target, delay, PrintWorkerLog, writeToPort);
          if (launchedPid == 0) {
            ns.print("ThreadToLaunchOnserver: " + threadsToRun + "; " + (servInfo.server.maxRam - servInfo.server.ramUsed))
          }
          else if (prepareScript) {
            prepareScriptPid.push([servInfo.server.hostname, launchedPid]);
          }
          let launchedCount = servInfo.threadsAvailable;
          threadsToRun -= launchedCount;
          threadStarted += launchedCount;
          servInfo.threadsAvailable -= launchedCount;
        }
        if (threadStarted == threadCount)
          break;
      }
    }
  }
  if (writeToPort && !needToWrite) { debugger; }
  return threadStarted;
}
function CalculateRunningThreadsForServer(ns: NS, server: ServerDTO, totalAvailableThreads: number): number {
  if (server.server.hasAdminRights) {
    let ramPerThread = ns.getScriptRam(Weaken1Name);
    let ramAvailable = server.server.maxRam - server.server.ramUsed;
    if (server.server.hostname == "home") {
      let runningScripts = ns.ps(server.server.hostname);
      if (ns.gang.inGang() && !runningScripts.some((a) => a.filename == "gang.ts") && ramAvailable - ns.getScriptRam("gang.ts") > 0)
        ramAvailable -= ns.getScriptRam("gang.ts");
      if (!runningScripts.some((a) => a.filename == "buy.js") && ramAvailable - ns.getScriptRam("buy.js") > 0)
        ramAvailable -= ns.getScriptRam("buy.js");
      if (!runningScripts.some((a) => a.filename == "test.js") && ramAvailable - ns.getScriptRam("buy.js") > 0)
        ramAvailable -= ns.getScriptRam("test.js");
      if (!runningScripts.some((a) => a.filename == "contr/manageContr.js") && ramAvailable - ns.getScriptRam("manageContr.js") > 0)
        ramAvailable -= ns.getScriptRam("contr/manageContr.js");
    }

    server.threadsAvailable = Math.floor(ramAvailable / ramPerThread);
    totalAvailableThreads += server.threadsAvailable;
  }
  return totalAvailableThreads;
}
async function BuyPrograms(ns: NS, progData: ProgData, player: Player) {
  if (player.money > 200_000 && !ns.hasTorRouter()) {
    ns.exec(BuyTor, "home", 1);
    await ns.nextPortWrite(BuyTorOrProgPort);
    ns.clearPort(BuyTorOrProgPort);
    player.money -= 200_000;
  }
  if (!ns.fileExists(progData.Deep1[0])) {
    if (player.money > 500_000) {
      player.money -= 500_000;
      ns.exec(BuyProg, "home", 1, progData.Deep1[0]);
      progData.Deep1[1] = true;
      await ns.nextPortWrite(BuyTorOrProgPort);
      ns.clearPort(BuyTorOrProgPort);
    }
  }
  else {
    progData.Deep1[1] = true;
  }
  if (!ns.fileExists(progData.BruteSSH[0])) {
    if (player.money > 500_000) {
      player.money -= 500_000;
      ns.exec(BuyProg, "home", 1, progData.BruteSSH[0]);
      progData.BruteSSH[1] = true;
      await ns.nextPortWrite(BuyTorOrProgPort);
      ns.clearPort(BuyTorOrProgPort);
    }
  }
  else {
    progData.BruteSSH[1] = true;
  }
  if (!ns.fileExists(progData.FTPCrack[0])) {
    if (player.money > 1_500_000) {
      player.money -= 1_500_000;
      ns.exec(BuyProg, "home", 1, progData.FTPCrack[0]);
      progData.FTPCrack[1] = true;
      await ns.nextPortWrite(BuyTorOrProgPort);
      ns.clearPort(BuyTorOrProgPort);
    }
  }
  else {
    progData.FTPCrack[1] = true;
  }
  if (!ns.fileExists(progData.RelaySMTP[0])) {
    if (player.money > 5_000_000) {
      player.money -= 5_000_000;
      ns.exec(BuyProg, "home", 1, progData.RelaySMTP[0]);
      progData.RelaySMTP[1] = true;
      await ns.nextPortWrite(BuyTorOrProgPort);
      ns.clearPort(BuyTorOrProgPort);
    }
  }
  else {
    progData.RelaySMTP[1] = true;
  }
  if (!ns.fileExists(progData.Deep2[0])) {
    if (player.money > 25_000_000) {
      player.money -= 25_000_000;
      ns.exec(BuyProg, "home", 1, progData.Deep2[0]);
      progData.Deep2[1] = true;
      await ns.nextPortWrite(BuyTorOrProgPort);
      ns.clearPort(BuyTorOrProgPort);
    }
  }
  else {
    progData.Deep2[1] = true;
  }
  if (!ns.fileExists(progData.HTTPWorm[0])) {
    if (player.money > 30_000_000) {
      player.money -= 30_000_000;
      ns.exec(BuyProg, "home", 1, progData.HTTPWorm[0]);
      progData.HTTPWorm[1] = true;
      await ns.nextPortWrite(BuyTorOrProgPort);
      ns.clearPort(BuyTorOrProgPort);
    }
  }
  else {
    progData.HTTPWorm[1] = true;
  }
  if (!ns.fileExists(progData.SQLInject[0])) {
    if (player.money > 250_000_000) {
      player.money -= 250_000_000;
      ns.exec(BuyProg, "home", 1, progData.SQLInject[0]);
      progData.SQLInject[1] = true;
      await ns.nextPortWrite(BuyTorOrProgPort);
      ns.clearPort(BuyTorOrProgPort);
    }
  }
  else {
    progData.SQLInject[1] = true;
  }
}
function OpenPortsAndUpdateServerInfo(ns: NS, servDTO: ServerDTO[], progData: ProgData, player: Player) {
  for (let server of servDTO) {
    server.server = ns.getServer(server.server.hostname);
    let openPorts = 0;
    if (!server.server.hasAdminRights) {
      if (server.server.sshPortOpen) {
        openPorts++;
      } else if (progData.BruteSSH[1]) {
        ns.brutessh(server.server.hostname);
        openPorts++;
      }
      if (server.server.ftpPortOpen) {
        openPorts++;
      }
      else if (progData.FTPCrack[1]) {
        ns.ftpcrack(server.server.hostname);
        openPorts++;
      }
      if (server.server.smtpPortOpen) {
        openPorts++;
      }
      else if (progData.RelaySMTP[1]) {
        ns.relaysmtp(server.server.hostname);
        openPorts++;
      }
      if (server.server.httpPortOpen) {
        openPorts++;
      }
      else if (progData.HTTPWorm[1]) {
        ns.httpworm(server.server.hostname);
        openPorts++;
      }
      if (server.server.sqlPortOpen) {
        openPorts++;
      }
      else if (progData.SQLInject[1]) {
        ns.sqlinject(server.server.hostname);
        openPorts++;
      }
      if ((server.server.numOpenPortsRequired ?? 0) <= openPorts) {
        ns.nuke(server.server.hostname);
      }
    }

    if (server.server.moneyMax != server.server.moneyAvailable) {
      server.needPrep = true;
    }
    else if (server.server.hackDifficulty != server.server.minDifficulty) {
      server.needPrep = true;
    }
    else {
      server.needPrep = false;
    }
  }
}
async function InstallBackDoors(ns: NS, item: BackDoorStatusItem, player: Player) {
  const servItem = ns.getServer(item.name)
  if (servItem.hasAdminRights && !servItem.backdoorInstalled && !servItem.purchasedByPlayer &&
    servItem.hostname != "home" && player.skills.hacking > (servItem.requiredHackingSkill ?? 0)) {

    ns.exec(InstallBackDoor, "home", 1, servItem.hostname);
    await ns.nextPortWrite(EnterFactionOrBackdoorPort);
    ns.clearPort(EnterFactionOrBackdoorPort);
    item.backdoored = true;
    ns.exec(EnterFaction, "home", 1, item.factionName);
    await ns.nextPortWrite(EnterFactionOrBackdoorPort);
    const joined = ns.readPort(EnterFactionOrBackdoorPort) as boolean;
    ns.clearPort(EnterFactionOrBackdoorPort);
    item.enteredFaction = joined;
  }
}
function CheckIfPrepeareFinished(ns: NS, prepareScriptPid: [string, number][]): boolean {
  let res = true;
  for (let item of prepareScriptPid) {
    let runningScripts = ns.ps(item[0]);
    if (runningScripts.some((a) => a.pid == item[1])) {
      res = false;
      break;
    }
  }
  return res;
}
function ClearValuesForServer(servers: ServerDTO[]) {
  for (let item of servers) {
    item.bacthInfo.growThreadCount = 0;
    item.bacthInfo.growThreadCount = 0;
    item.bacthInfo.weaken1ThreadCount = 0;
    item.bacthInfo.weaken2ThreadCount = 0;
    item.bacthInfo.hackThreadCount = 0;
    item.bacthInfo.growDelay = 0;
    item.bacthInfo.hackDelay = 0;
    item.bacthInfo.weaken1Delay = 0;
    item.bacthInfo.weaken2Delay = 0;
    item.bestMult = 0;
    item.bestMultValuePerThread = -1;
  }
}
function SortCompareServers(ns: NS, x: ServerDTO, y: ServerDTO, player: Player, freeThreads: number) {
  let res1 = x.bestMultValuePerThread;
  let res2 = y.bestMultValuePerThread;
  let bestMult1 = 0;
  let bestMult2 = 0;
  let batchInfo1 = new BacthCalcInfo();
  let batchInfo2 = new BacthCalcInfo();
  let tempRes1 = 0;
  let tempRes2 = 0;
  //already calculated, just compare
  if (res1 == -1 || res2 == -1) {
    //best multiplier loop
    for (let i = (1 - MultStep * 2) / MultStep - 1; i > -1; i--) {
      let mult = MultStepStart + (i * MultStep);

      for (let servItem = 0; servItem < 2; servItem++) {
        if ((servItem == 0 && res1 == -1) || (servItem == 1 && res2 == -1)) {
          let servInfo: Server = {} as Server;
          //item X & Y for loop
          if (servItem == 0) { servInfo = CreateMockServer(ns, x.server); }
          else { servInfo = CreateMockServer(ns, y.server); }
          if (servInfo.hackDifficulty && servInfo.minDifficulty && servInfo.moneyMax) {
            if (SortAsPrepeared) {
              servInfo.hackDifficulty = servInfo.minDifficulty;
              servInfo.moneyAvailable = servInfo.moneyMax;
            }
            let hackPercent = ns.formulas.hacking.hackPercent(servInfo, player);
            let hackThreads = Math.ceil((0.5 + mult) / hackPercent);
            let hackTime = ns.formulas.hacking.hackTime(servInfo, player);
            servInfo.hackDifficulty += hackThreads * 0.002;

            let weakenThreads1 = Math.ceil((servInfo.hackDifficulty - servInfo.minDifficulty) / ns.weakenAnalyze(1, 1));
            let weaken1Time = ns.formulas.hacking.weakenTime(servInfo, player);
            servInfo.hackDifficulty = servInfo.minDifficulty;
            servInfo.moneyAvailable = servInfo.moneyMax * (0.5 - mult);

            let growTime = ns.formulas.hacking.growTime(servInfo, player);
            let growThreads = ns.formulas.hacking.growThreads(servInfo, player, servInfo.moneyMax, 1);

            servInfo.hackDifficulty = servInfo.minDifficulty + growThreads * 0.004;
            let weakenThreads2 = Math.ceil((servInfo.hackDifficulty - servInfo.minDifficulty) / ns.weakenAnalyze(1, 1));
            servInfo.hackDifficulty = servInfo.minDifficulty;
            let weaken2Time = ns.formulas.hacking.weakenTime(servInfo, player);
            let time = Math.max(hackTime, weaken1Time, growTime, weaken2Time);

            let thrCount = hackThreads + weakenThreads1 + weakenThreads2 + growThreads;
            if (Math.floor(freeThreads / thrCount) > MaxWorkerCount || freeThreads < thrCount)
              continue;
            let moneyPerS = servInfo.moneyMax * (0.5 + mult) / time * 1000;
            let monPerT = servInfo.moneyMax / thrCount;
            let sPerT = moneyPerS / thrCount;
            let sPerTPerBatch = Math.floor(freeThreads / thrCount) * sPerT;
            //fill batch info for x\y
            if (servItem == 0) {
              if (tempRes1 != Math.max(tempRes1, sPerTPerBatch)) {
                tempRes1 = Math.max(tempRes1, sPerTPerBatch);
                bestMult1 = mult;

                batchInfo1.growThreadCount = growThreads;
                batchInfo1.weaken1ThreadCount = weakenThreads1;
                batchInfo1.weaken2ThreadCount = weakenThreads2;
                batchInfo1.hackThreadCount = hackThreads;
                batchInfo1.hackDelay = time - hackTime;
                batchInfo1.weaken1Delay = time - weaken1Time;
                batchInfo1.growDelay = time - growTime;
                batchInfo1.weaken2Delay = time - weaken2Time;

                batchInfo1.weak1Time = weaken1Time;
                batchInfo1.weak2Time = weaken2Time;
                batchInfo1.growTime = growTime;
                batchInfo1.hackTime = hackTime;

                batchInfo1.totalTime = time;
              }
              x.bestMult = bestMult1;
              x.bestMultValuePerThread = tempRes1;
              x.bacthInfo = batchInfo1;
            } else {
              let delayOffset = 0;
              if (tempRes2 != Math.max(tempRes2, sPerTPerBatch)) {
                tempRes2 = Math.max(tempRes2, sPerTPerBatch);
                bestMult2 = mult;

                batchInfo2.growThreadCount = growThreads;
                batchInfo2.weaken1ThreadCount = weakenThreads1;
                batchInfo2.weaken2ThreadCount = weakenThreads2;
                batchInfo2.hackThreadCount = hackThreads;
                batchInfo2.hackDelay = time - hackTime;
                batchInfo2.weaken1Delay = time - weaken1Time;
                batchInfo2.growDelay = time - growTime;
                batchInfo2.weaken2Delay = time - weaken2Time;

                batchInfo1.weak1Time = weaken1Time;
                batchInfo1.weak2Time = weaken2Time;
                batchInfo1.growTime = growTime;
                batchInfo1.hackTime = hackTime;

                batchInfo2.totalTime = time;
              }
              y.bestMult = bestMult2;
              y.bestMultValuePerThread = tempRes2;
              y.bacthInfo = batchInfo2;
            }
          }
        }
      }
    }
  }
  if (res1 == -1)
    res1 = tempRes1;
  if (res2 == -1)
    res2 = tempRes2;
  if (x.server.moneyMax == 0 && y.server.moneyMax == 0)
    return 0;
  else if (x.server.moneyMax == 0)
    return 1;
  else if (y.server.moneyMax == 0)
    return -1;
  if ((x.needPrep && y.needPrep) || (!x.needPrep && !y.needPrep)) {
    return res2 - res1;
  }
  if (x.needPrep) {
    return 1;
  } else {
    return -1;
  }

}

function CreateMockServer(ns: NS, serv: Server): Server {
  // Create a fresh mock server object
  const res = ns.formulas.mockServer();

  res.backdoorInstalled = serv.backdoorInstalled;
  res.baseDifficulty = serv.baseDifficulty;
  res.cpuCores = serv.cpuCores;
  res.ftpPortOpen = serv.ftpPortOpen;
  res.hackDifficulty = serv.hackDifficulty;
  res.hasAdminRights = serv.hasAdminRights;
  res.hostname = serv.hostname;
  res.httpPortOpen = serv.httpPortOpen;
  res.ip = serv.ip;
  res.isConnectedTo = serv.isConnectedTo;
  res.maxRam = serv.maxRam;
  res.minDifficulty = serv.minDifficulty;
  res.moneyAvailable = serv.moneyAvailable;
  res.moneyMax = serv.moneyMax;
  res.numOpenPortsRequired = serv.numOpenPortsRequired;
  res.openPortCount = serv.openPortCount;
  res.organizationName = serv.organizationName;
  res.purchasedByPlayer = serv.purchasedByPlayer;
  res.ramUsed = serv.ramUsed;
  res.requiredHackingSkill = serv.requiredHackingSkill;
  res.serverGrowth = serv.serverGrowth;
  res.smtpPortOpen = serv.smtpPortOpen;
  res.sqlPortOpen = serv.sqlPortOpen;
  res.sshPortOpen = serv.sshPortOpen;
  return res;
}


//check if any scripts exist and server need to be ignored until finished
function CheckPreStartScripts(ns: NS, serverDTO: ServerDTO[], currentList: [string, number][]): [boolean, [string, number][]] {
  function tupleKey(t: [string, number]): string { return `${t[0]}|${t[1]}`; }

  let foundAny = false;
  let foundProc: [string, number][] = [];
  for (let server of serverDTO) {
    let runningScripts = ns.ps(server.server.hostname);
    for (let i = 0; i < runningScripts.length; i++) {
      let target = runningScripts[i].args[0] as string;
      const found = serverDTO.find(a => a.server.hostname === target);
      if (found && !foundProc.some((a) => a[0] == target)) {
        found.preStartScripts = true;
        foundAny = true;
        foundProc.push([target, runningScripts[i].pid]);
      }
    }
  }
  if (currentList.length > 0 && foundAny) {
    const set2 = new Set(foundProc.map(tupleKey));
    foundAny = currentList.some(t => set2.has(tupleKey(t)));
    if (foundAny) {
      foundProc = currentList;
    }
    else {
      for (let server of serverDTO) {
        server.preStartScripts = false;
      }
    }
  }
  return [foundAny, foundProc];
}
class ServerDTO {
  public threadsAvailable: number = 0;
  public server: Server = {} as Server;
  public bestMult: number = 0;
  public bestMultValuePerThread: number = -1;
  public preStartScripts = false;
  public bacthInfo: BacthCalcInfo = {} as BacthCalcInfo;
  public needPrep = false;
  //public lastBatchFinishTime = 0;
}
class BacthCalcInfo {
  public hackThreadCount: number = 0;
  public weaken1ThreadCount: number = 0;
  public weaken2ThreadCount: number = 0;
  public growThreadCount: number = 0;
  public hackDelay: number = 0;
  public growDelay: number = 0;
  public weaken1Delay: number = 0;
  public weaken2Delay: number = 0;
  public totalTime: number = 0;
  public weak1Time: number = 0;
  public weak2Time: number = 0;
  public growTime: number = 0;
  public hackTime: number = 0;

  get totalThreads(): number {
    return this.hackThreadCount + this.weaken1ThreadCount + this.weaken2ThreadCount +
      this.growThreadCount;
  }
}

class ProgData {
  public BruteSSH: [string, boolean] = ["BruteSSH.exe", false];
  public FTPCrack: [string, boolean] = ["FTPCrack.exe", false];
  public RelaySMTP: [string, boolean] = ["RelaySMTP.exe", false];
  public HTTPWorm: [string, boolean] = ["HTTPWorm.exe", false];
  public SQLInject: [string, boolean] = ["SQLInject.exe", false];
  public Deep1: [string, boolean, boolean] = ["DeepScanV1.exe", false, false];
  public Deep2: [string, boolean, boolean] = ["DeepScanV2.exe", false, false];

  get AllBought(): boolean {
    return this.BruteSSH[1] && this.FTPCrack[1] && this.RelaySMTP[1] &&
      this.HTTPWorm[1] && this.SQLInject[1] && this.Deep2[1];
  }
}

class BackDoorServersStatus {
  private allDone = false;
  public backdoorServerList: BackDoorStatusItem[] = [];

  constructor() {
    this.backdoorServerList.push(new BackDoorStatusItem("CSEC", true, "CyberSec"));
    this.backdoorServerList.push(new BackDoorStatusItem("avmnite-02h", true, "NiteSec"));
    this.backdoorServerList.push(new BackDoorStatusItem("I.I.I.I", true, "The Black Hand"));
    this.backdoorServerList.push(new BackDoorStatusItem("run4theh111z", true, "BitRunners"));
  }

  get AllDone(): boolean {
    if (this.allDone)
      return true;
    else {
      this.allDone = !this.backdoorServerList.some((a) => a.backdoored == false)
      return this.allDone;
    }
  }
}
class BackDoorStatusItem {
  public name: string = "";
  public backdoored: boolean = false;
  public enteredFaction: boolean = false;
  public factionName: string = "";

  constructor(name: string, enteredFaction: boolean, factionName: string) {
    this.name = name;
    this.enteredFaction == enteredFaction;
    this.factionName = factionName;
  }
}
