const BASE_REP = 25000;
const GROWTH = 1.02;
const repAtTable: { [key: number]: number } = {};
let BASE_RATE = 20;
let TARGET = 150;
let TimeNoReset = repAt(TARGET) / BASE_RATE;

export async function main(ns: NS) {
  // Run
  //const params = JSON.parse(ns.args[0] as string)
  let params = new CalcResetInputParams();
  //params = params.fromJSON(ns.args[0] as string);
  let maxNumOfResets = params.maxNumOfResets;
  let port = params.port;
  let tPrint = params.tPrint;
  let print = params.print;
  BASE_RATE = params.repGainPerSecond;//rep per second
  TARGET = params.targetFavor;//target favor
  TimeNoReset = repAt(TARGET) / BASE_RATE;//time to target favor with no install
  const result = findBestStrategy(maxNumOfResets);
  if (tPrint)
    ns.tprint(result);
  if (print)
    ns.print(result);
  if (port >= 0)
    ns.writePort(port, result);
}

/** Reputation for N favor */
function repAt(N: number): number {
  return BASE_REP * (Math.pow(GROWTH, N) - 1);
}

/** Multiplier after reset at N */
function multiplier(N: number): number {
  return 1 + N / 100;
}

/** Time with no resets */
function timeNoReset(): number {
  return TimeNoReset;
}

/** Time with any resets. Args version */
function timeMultResets(...N: number[]): number {
  let idx = 0;
  let temp = repAtTable[N[idx++]] / BASE_RATE;
  for (let count = 1; count < N.length; count++) {
    temp += repAtTable[N[idx]] / (BASE_RATE * multiplier(N[idx - 1]));
    idx++;
  }
  temp += repAtTable[TARGET] / (BASE_RATE * multiplier(N[N.length - 1]))
  return temp;
}

function timeMultResetsV2(N: number[]): number {
  let totalTime = 0;
  let prevFavor = 0;
  let currentMultiplier = 1;

  for (let i = 0; i < N.length; i++) {
    const neededRep = repAtTable[N[i]] - repAtTable[prevFavor];
    totalTime += neededRep / (BASE_RATE * currentMultiplier);

    // After reset, multiplier increases
    currentMultiplier = multiplier(N[i]);
    prevFavor = N[i];
  }

  // Final stretch: from last reset to TARGET
  const finalRep = repAtTable[TARGET] - repAtTable[prevFavor];
  totalTime += finalRep / (BASE_RATE * currentMultiplier);

  return totalTime;
}


/** Time with any resets. Array version 
function timeMultResetsV2(N: number[]): number {
  let idx = 0;
  let temp = repAtTable[N[idx++]] / BASE_RATE;
  for (let count = 1; count < N.length; count++) {
    temp += repAtTable[N[idx]] / (BASE_RATE * multiplier(N[idx - 1]));
    idx++;
  }
  temp += repAtTable[TARGET] / (BASE_RATE * multiplier(N[N.length - 1]))
  return temp;
}*/

function fillRepAtTable() {
  for (let i = 0; i <= TARGET; i++) {
    repAtTable[i] = repAt(i);
  }
}

function incrementArray(idx: number, arr: number[], max: number) {
  if (arr[idx] <= max) {
    arr[idx]++;
  }
  else {
    if (idx > 0) {
      incrementArray(idx - 1, arr, max);
      arr[idx] = arr[idx - 1] + 1;
    }
    else {
      arr[0]++;
    }
  }
}


/** Brute-force search */
function findBestStrategy(maxNumOfResets: number) {
  let bestTime = timeNoReset();
  let best: string = "No reset";

  fillRepAtTable();

  let numberArr: number[] = [];
  for (let i = 0; i < maxNumOfResets; i++) {
    numberArr[i] = i;
  }
  // N resets
  while (numberArr[0] <= TARGET) {
    const t = timeMultResetsV2(numberArr);
    if (t < bestTime) {
      bestTime = t;
      best = `Resets at N=${numberArr}`;
    }
    incrementArray(numberArr.length - 1, numberArr, TARGET);
  }

  return { best, bestTime };
}

export class CalcResetInputParams {
  targetFavor: number = 150;
  repGainPerSecond: number = 20;
  maxNumOfResets: number = 3;
  port: number = -1;
  tPrint: boolean = true;
  print: boolean = false;

  // Serialize to JSON string 
  toJSON(): string {
    return JSON.stringify({
      targetFavor: this.targetFavor,
      repGainPerSecond: this.repGainPerSecond,
      maxNumOfResets: this.maxNumOfResets,
      port: this.port,
      tPrint: this.tPrint,
      print: this.print,
    });
  }
  // Static factory to parse back from JSON string static 
  fromJSON(json: string): CalcResetInputParams {
    const obj = JSON.parse(json);
    const cfg = new CalcResetInputParams();
    Object.assign(cfg, obj);
    return cfg;
  }
}
