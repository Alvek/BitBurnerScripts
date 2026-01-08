let prepareScriptPid: [string, number][] = [];
const DelayBetweenBacthes: number = 5;
const MultStep: number = 0.01;
const MultStepStart: number = -0.5 + MultStep;
const Weaken1Name = "weak.js";
const Weaken2Name = "weak2.js";
const GrowName = "grow.js";
const HackName = "hack.js";
const MaxWorkerCount = 300000;
const PrintLog = true;

/** @param {NS} ns **/
export async function main(ns: NS) {
  DisableLog(ns);
  let scanned = false;
  let deep1 = ns.fileExists("DeepScanV1.exe");
  let deep2 = ns.fileExists("DeepScanV2.exe");
  let servDTO: ServerDTO[] = [];
  let checkPreStart = true;
  let prepearingInProgress = false;
  let preStartProcList: [string, number][] = [];
  let anyPreped = false;
  let totalWorkerCount = 0;
  while (true) {
    if (!deep1 && ns.fileExists("DeepScanV1.exe")) {
      scanned = false;
      deep1 = true;
    }
    if (!deep2 && ns.fileExists("DeepScanV2.exe")) {
      scanned = false;
      deep2 = true;
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
          await ns.scp([
            Weaken1Name,
            Weaken2Name,
            GrowName,
            HackName
          ], server);
        }
      }
      scanned = true;
    }
    if (checkPreStart) {
      let res = CheckPreStartScripts(ns, servDTO, preStartProcList);
      preStartProcList = res[1];
      checkPreStart = res[0];
      await ns.sleep(100);
      continue;
    }
    prepearingInProgress = !CheckIfPrepeareFinished(ns);
    let player = ns.getPlayer();
    ClearValuesForServer(servDTO);
    totalWorkerCount = OpenPortsAndUpdateServerInfo(ns, servDTO);
    servDTO.sort((a, b) => SortCompareServers(ns, a, b, player));
    let totalAvailableThreads = 0;
    for (let server of servDTO) {
      totalAvailableThreads = CalculateRunningThreadsForServer(ns, server, totalAvailableThreads);
    }
    if (!servDTO.some((a) => !a.needPrep && (a.server?.moneyMax ?? 0) > 0)) {
      let noodlesServ = servDTO.find((a) => a.server.hostname == "n00dles") ?? servDTO[0];
      if (noodlesServ.needPrep && !prepearingInProgress) {
        PrepServerBatch(ns, noodlesServ, totalAvailableThreads, servDTO);
        prepearingInProgress = true;
        anyPreped = false;
        await ns.sleep(0);
      }
    }
    else { anyPreped = true; }
    if (!anyPreped) {
      await ns.sleep(0);
      continue;
    }
    debugger;
    for (let servInfo of servDTO) {
      if (checkPreStart && !preStartProcList.some((a) => a[0] == servInfo.server.hostname) || servInfo.needPrep) {
        continue;
      }
      let totaTime = servInfo.bacthInfo.totalTime;
      let batchCount = totalAvailableThreads / servInfo.bacthInfo.totalThreads;
      /*if (totaTime / DelayBetweenBacthes > batchCount) {
        ns.tprint(`Server:${servInfo.server.hostname} too small for all bacthes:${batchCount}, totalTime:${totaTime}`);
        continue;
      }*/
      if (totalAvailableThreads > servInfo.bacthInfo.totalThreads) {
        if (servInfo.server.moneyMax != 0 && servInfo.server.hasAdminRights &&
          totalAvailableThreads > 0 && (servInfo.server.hackDifficulty ?? 0) < player.skills.hacking) {
          let now = Date.now() - ns.getResetInfo().lastAugReset;
          if (totalAvailableThreads > servInfo.bacthInfo.totalThreads &&
            now - servInfo.bacthInfo.totalTime > servInfo.lastBatchFinishTime) {
            if (servInfo.needPrep) {
              ns.tprint("Desync:" + servInfo.server.hostname);
              ns.tprint(`Now ${now}, start time ${now - servInfo.bacthInfo.totalTime}, prev batch end time ${servInfo.lastBatchFinishTime}`)
              ns.exit();
            }
            ns.tprint(`Batch started ${now}, prev batch end time ${servInfo.lastBatchFinishTime}`)
            while (totalAvailableThreads > servInfo.bacthInfo.totalThreads) {
              let launchedCount = RunScriptsForTarget(ns, HackName, servInfo.server.hostname, servInfo.bacthInfo.hackThreadCount, servDTO, servInfo.bacthInfo.hackDelay);
              totalAvailableThreads -= launchedCount;
              launchedCount = RunScriptsForTarget(ns, Weaken1Name, servInfo.server.hostname, servInfo.bacthInfo.weaken1ThreadCount, servDTO, servInfo.bacthInfo.weaken1Delay);
              totalAvailableThreads -= launchedCount;
              launchedCount = RunScriptsForTarget(ns, GrowName, servInfo.server.hostname, servInfo.bacthInfo.growThreadCount, servDTO, servInfo.bacthInfo.growDelay);
              totalAvailableThreads -= launchedCount;
              launchedCount = RunScriptsForTarget(ns, Weaken2Name, servInfo.server.hostname, servInfo.bacthInfo.weaken2ThreadCount, servDTO, servInfo.bacthInfo.weaken2Delay);
              totalAvailableThreads -= launchedCount;
              servInfo.lastBatchFinishTime = now + servInfo.bacthInfo.totalTime + DelayBetweenBacthes;
              ns.exit();
            }
          }
        }
      }
      else if (servInfo.needPrep && !prepearingInProgress) {
        ns.tprint(`Not enough threads:${servInfo.server.hostname}`)
        totalAvailableThreads -= PrepServerBatch(ns, servInfo, totalAvailableThreads, servDTO);
      }
      else if (prepearingInProgress || totalAvailableThreads == 0) {
        break;
      }
    }
    if (!prepearingInProgress && totalAvailableThreads > 0) {
      ns.tprint("FreeThreads:" + totalAvailableThreads);
    }
    await ns.sleep(0);
  }
}

function DisableLog(ns: NS) {
  ns.disableLog("disableLog");
  ns.disableLog("ftpcrack");
  ns.disableLog("getServerSecurityLevel");
  ns.disableLog("getServerNumPortsRequired");
  ns.disableLog("sqlinject");
  ns.disableLog("relaysmtp");
  ns.disableLog("httpworm");
  ns.disableLog("brutessh");
  ns.disableLog("nuke");
  ns.disableLog("scp");
  ns.disableLog("getServerUsedRam");
  ns.disableLog("getServerMaxRam");
  ns.disableLog("getScriptRam");
  ns.disableLog("hackAnalyze");
  ns.disableLog("getServerMoneyAvailable");
  ns.disableLog("getServerGrowth");
  ns.disableLog("getServerMinSecurityLevel");
  ns.disableLog("hackAnalyzeChance");
  ns.disableLog("getServerMaxMoney");
  ns.disableLog("scan");
  ns.disableLog("sleep");
}
function PrepServerBatch(ns: NS, server: ServerDTO, threadsAvailable: number, availableServers: ServerDTO[]): number {
  let weak1threads = 0;
  let growthreads = 0;
  let weak2threads = 0;
  let weak1Time = 0;
  let growTime = 0;
  let weak2Time = 0;
  let cloneServ = structuredClone(server.server);
  if (cloneServ.hackDifficulty != cloneServ.minDifficulty) {
    let threadNeeded = Math.ceil((ns.getServerSecurityLevel(cloneServ.hostname) - ns.getServerMinSecurityLevel(cloneServ.hostname)) / ns.weakenAnalyze(1, 1));
    weak1threads = threadNeeded;
    weak1Time = ns.formulas.hacking.weakenTime(cloneServ, ns.getPlayer());
    ns.tprint("Weak1Time: " + weak1Time);
    ns.tprint("SecLvl: " + ns.getServerSecurityLevel(cloneServ.hostname));
    cloneServ.hackDifficulty = cloneServ.minDifficulty;
  }
  if (cloneServ.moneyMax != cloneServ.moneyAvailable && cloneServ.minDifficulty && cloneServ.moneyMax) {
    let threadNeeded = Math.ceil(ns.formulas.hacking.growThreads(cloneServ, ns.getPlayer(), cloneServ.moneyMax, 1));
    growthreads = threadNeeded;
    growTime = ns.formulas.hacking.growTime(cloneServ, ns.getPlayer());
    ns.tprint("GrowTime: " + growTime);
    ns.tprint("Money: " + ns.getServerMoneyAvailable(cloneServ.hostname));

    cloneServ.hackDifficulty = cloneServ.minDifficulty + growthreads * 0.004;
    weak2Time = ns.formulas.hacking.weakenTime(cloneServ, ns.getPlayer());
    ns.tprint("Weak2Time: " + weak2Time);
    weak2threads = Math.ceil((cloneServ.hackDifficulty - cloneServ.minDifficulty) / ns.weakenAnalyze(1, 1));

  }

  let maxTime: number = Math.max(weak1Time, growTime, weak2Time);
  let delay: number = maxTime - weak1Time;
  let launched: number = RunScriptsForTarget(ns, Weaken1Name, cloneServ.hostname, weak1threads, availableServers, delay, true);
  delay = maxTime - growTime;
  launched += RunScriptsForTarget(ns, GrowName, cloneServ.hostname, growthreads, availableServers, delay, true);
  delay = maxTime - weak2Time;
  launched += RunScriptsForTarget(ns, Weaken2Name, cloneServ.hostname, weak2threads, availableServers, delay, true);
  return threadsAvailable - launched;
}
function RunScriptsForTarget(ns: NS, scriptName: string, target: string, threadCount: number, availableServers: ServerDTO[], delay: number, prepareScript: boolean = false): number {
  let threadStarted = 0;
  if (threadCount > 0) {
    let threadsToRun = threadCount;
    for (let servInfo of availableServers) {
      if (servInfo.threadsAvailable > 0) {
        if (threadsToRun <= servInfo.threadsAvailable) {
          let launchedPid = ns.exec(scriptName, servInfo.server.hostname, threadsToRun, target, delay, PrintLog);
          if (launchedPid == 0) {
            ns.print("ThreadToLaunchOnserver: " + threadsToRun + "; " + (ns.getServerMaxRam(servInfo.server.hostname) - ns.getServerUsedRam(servInfo.server.hostname)))
          }
          else if (prepareScript) {
            prepareScriptPid.push([servInfo.server.hostname, launchedPid]);
          }
          threadStarted += threadsToRun;
          servInfo.threadsAvailable -= threadsToRun;
          threadsToRun = 0;
        }
        else {
          let launchedPid = ns.exec(scriptName, servInfo.server.hostname, servInfo.threadsAvailable, target, delay, PrintLog);
          if (launchedPid == 0) {
            ns.print("ThreadToLaunchOnserver: " + threadsToRun + "; " + (ns.getServerMaxRam(servInfo.server.hostname) - ns.getServerUsedRam(servInfo.server.hostname)))
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
  return threadStarted;
}
function CalculateRunningThreadsForServer(ns: NS, server: ServerDTO, totalAvailableThreads: number): number {
  if (ns.hasRootAccess(server.server.hostname)) {
    let ramPerThread = ns.getScriptRam(Weaken1Name);
    let ramAvailable = ns.getServerMaxRam(server.server.hostname) - ns.getServerUsedRam(server.server.hostname);
    if (server.server.hostname == "home") {
      let runningScripts = ns.ps(server.server.hostname);
      if (!runningScripts.some((a) => a.filename == "gang.ts") && ramAvailable - ns.getScriptRam("gang.ts") > 0)
        ramAvailable -= ns.getScriptRam("gang.ts");
      if (!runningScripts.some((a) => a.filename == "buy.js") && ramAvailable - ns.getScriptRam("buy.js") > 0)
        ramAvailable -= ns.getScriptRam("buy.js");
      if (!runningScripts.some((a) => a.filename == "test.js") && ramAvailable - ns.getScriptRam("buy.js") > 0)
        ramAvailable -= ns.getScriptRam("test.js");
      if (!runningScripts.some((a) => a.filename == "contr/manageContr.js") && ramAvailable - ns.getScriptRam("manageContr.js") > 0)
        ramAvailable -= ns.getScriptRam("contr/manageContr.js");
    }

    server.threadsAvailable += Math.floor(ramAvailable / ramPerThread);
    totalAvailableThreads += server.threadsAvailable;
  }
  return totalAvailableThreads;
}
function OpenPortsAndUpdateServerInfo(ns: NS, servDTO: ServerDTO[]): number {
  let res = 0;
  for (let server of servDTO) {
    server.server = ns.getServer(server.server.hostname);
    let openPorts = 0;
    if (ns.fileExists("BruteSSH.exe")) {
      ns.brutessh(server.server.hostname);
      openPorts++;
    }
    if (ns.fileExists("FTPCrack.exe")) {
      ns.ftpcrack(server.server.hostname);
      openPorts++;
    }
    if (ns.fileExists("RelaySMTP.exe")) {
      ns.relaysmtp(server.server.hostname);
      openPorts++;
    }
    if (ns.fileExists("HTTPWorm.exe")) {
      ns.httpworm(server.server.hostname);
      openPorts++;
    }
    if (ns.fileExists("SQLInject.exe")) {
      ns.sqlinject(server.server.hostname);
      openPorts++;
    }
    if (ns.getServerNumPortsRequired(server.server.hostname) <= openPorts) {
      ns.nuke(server.server.hostname);
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
    for (let info of ns.ps(server.server.hostname)) {

      if (info.filename == Weaken1Name || info.filename == Weaken2Name ||
        info.filename == GrowName || info.filename == HackName) {
        res += 1;
      }
    }
  }
  return res;
}
function CheckIfPrepeareFinished(ns: NS): boolean {
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
function SortCompareServers(ns: NS, x: ServerDTO, y: ServerDTO, player: Player) {
  let res1 = x.bestMultValuePerThread;
  let res2 = y.bestMultValuePerThread;
  let bestMult1 = 0;
  let bestMult2 = 0;
  let batchInfo1 = new BacthCalcInfo();
  let batchInfo2 = new BacthCalcInfo();

  if (res1 == -1 || res2 == -1) {
    for (let i = 0; i < (1 - MultStep * 2) / MultStep; i++) {
      let mult = MultStepStart + (i * MultStep);

      for (let servItem = 0; servItem < 2; servItem++) {
        let servInfo: Server = {} as Server;
        if (servItem == 0) { servInfo = structuredClone(x.server, {}); }
        else { servInfo = structuredClone(y.server); }

        if ((servItem == 0 && res1 == -1) || (servItem == 1 && res2 == -1)) {
          if (servInfo.hackDifficulty && servInfo.minDifficulty && servInfo.moneyMax) {
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
            let weaken2Time = ns.formulas.hacking.weakenTime(servInfo, player);
            let weakenThreads2 = Math.ceil((servInfo.hackDifficulty - servInfo.minDifficulty) / ns.weakenAnalyze(1, 1));
            let time = Math.max(hackTime, weaken1Time, growTime, weaken2Time);

            let thrCount = hackThreads + weakenThreads1 + weakenThreads2 + growThreads;
            let moneyPerS = servInfo.moneyMax * (0.5 + mult) / time * 1000;
            let monPerT = servInfo.moneyMax / thrCount;
            let sPerT = moneyPerS / thrCount;

            if (servItem == 0) {
              if (res1 != Math.max(res1, sPerT)) {
                res1 = Math.max(res1, sPerT);
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
              x.bestMultValuePerThread = res1;
              x.bacthInfo = batchInfo1;
            } else {
              let delayOffset = 0;
              if (res2 != Math.max(res2, sPerT)) {
                res2 = Math.max(res2, sPerT);
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
              y.bestMultValuePerThread = res2;
              y.bacthInfo = batchInfo2;
            }
          }
        }
      }
    }
  }
  if (x.server.moneyMax == 0)
    return 1;
  if ((x.needPrep && y.needPrep) || (!x.needPrep && !y.needPrep)) {
    return res2 - res1;
  }
  if (x.needPrep) {
    return 1;
  } else {
    return -1;
  }

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
  public lastBatchFinishTime = 0;
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
