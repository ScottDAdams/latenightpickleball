#!/usr/bin/env node
"use strict";

const {
  generateRandomRoundMatches,
  normalizePairKey,
} = require("./pairing.js");

const noop = () => {};
const origWarn = console.warn;
function quietWarn() {
  console.warn = noop;
}
function restoreWarn() {
  console.warn = origWarn;
}

function runPairingTest() {
  const players = Array.from({ length: 24 }, (_, i) => ({
    id: "P" + String(i + 1).padStart(2, "0"),
    name: String(i + 1),
  }));

  let config = {
    partnerHistory: {},
    playerByeCounts: {},
    playerLastByeRound: {},
    mode: "random_pairs",
  };
  players.forEach((p) => {
    config.playerByeCounts[p.id] = 0;
    config.playerLastByeRound[p.id] = 0;
  });
  config.players = players;

  const seen = new Set();
  const rounds = 11;
  const courts = 6;

  for (let r = 1; r <= rounds; r++) {
    const res = generateRandomRoundMatches(players, courts, config, r, {
      maxRetries: 2000,
      strictNoRepeat: true,
    });
    if (!res || res.impossible) throw new Error("Pairing impossible at round " + r);
    if (!res.matches) throw new Error("No matches returned in round " + r);
    if (!res.pairs) throw new Error("No pairs returned in round " + r);
    config = res.config;

    for (const [aId, bId] of res.pairs) {
      const key = normalizePairKey(aId, bId);
      if (seen.has(key)) throw new Error("Repeat pair " + key + " in round " + r);
      seen.add(key);
    }
  }

  console.log("PASS: " + seen.size + " unique pairs across " + rounds + " rounds");
}

function runScenario(name, playerCount, courtCount, totalRounds, runs) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: "P" + String(i + 1).padStart(2, "0"),
    name: String(i + 1),
  }));
  let failed = 0;
  let repeatFail = 0;
  for (let run = 0; run < runs; run++) {
    quietWarn();
    let config = {
      partnerHistory: {},
      playerByeCounts: {},
      playerLastByeRound: {},
      mode: "random_pairs",
    };
    players.forEach((p) => {
      config.playerByeCounts[p.id] = 0;
      config.playerLastByeRound[p.id] = 0;
    });
    config.players = players;
    const seen = new Set();
    let impossible = false;
    let repeated = false;
    for (let r = 1; r <= totalRounds; r++) {
      const res = generateRandomRoundMatches(players, courtCount, config, r, {
        maxRetries: 2000,
        strictNoRepeat: true,
      });
      if (!res || res.impossible) {
        impossible = true;
        break;
      }
      config = res.config;
      for (const [aId, bId] of res.pairs) {
        const key = normalizePairKey(aId, bId);
        if (seen.has(key)) {
          repeated = true;
          break;
        }
        seen.add(key);
      }
      if (repeated) break;
    }
    restoreWarn();
    if (impossible) failed++;
    if (repeated) repeatFail++;
  }
  if (failed > 0 || repeatFail > 0) {
    console.error(name + ": FAIL runs=" + runs + " impossible=" + failed + " repeats=" + repeatFail);
    process.exit(1);
  }
  console.log(name + ": " + runs + " runs OK");
}

function main() {
  console.log("Definitive test: 24 players, 6 courts, 11 rounds");
  runPairingTest();

  // Rounds kept under theoretical max so greedy never gets stuck (no repeat needed).
  // E.g. 8p 2c: C(8,2)=28 pairs, 4 pairs/round → max 7 rounds; we use 5 for slack.
  console.log("\nStress tests (100 random shuffles per scenario):");
  runScenario("8 players, 2 courts, 5 rounds", 8, 2, 5, 100);
  runScenario("10 players, 3 courts, 6 rounds (BYEs)", 10, 3, 6, 100);
  runScenario("12 players, 3 courts, 8 rounds", 12, 3, 8, 100);
  runScenario("24 players, 6 courts, 11 rounds", 24, 6, 11, 100);

  console.log("\nAll tests passed.");
}

main();
