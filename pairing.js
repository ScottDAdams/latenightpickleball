(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PAIRING = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalizePairKey(aId, bId) {
    const x = String(aId);
    const y = String(bId);
    return x < y ? x + "|" + y : y + "|" + x;
  }

  function parsePairLabel(label) {
    if (!label || typeof label !== "string") return [];
    const parts = label.split(" \u0026 ");
    return parts.length === 2 ? parts : [];
  }

  function shuffleArray(array) {
    const shuffled = array.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function pickByes(players, capacity, state, roundNum) {
    const byeCounts = { ...(state.playerByeCounts || {}) };
    const lastBye = { ...(state.playerLastByeRound || {}) };
    players.forEach(function (p) {
      const id = p.id != null ? p.id : p;
      byeCounts[id] = byeCounts[id] ?? 0;
      lastBye[id] = lastBye[id] ?? 0;
    });
    if (players.length <= capacity) {
      return {
        active: players.map(function (p) { return { ...p }; }),
        byes: [],
        state: { ...state, playerByeCounts: byeCounts, playerLastByeRound: lastBye },
      };
    }
    const byesNeeded = players.length - capacity;
    const counts = players.map(function (p) {
      const id = p.id != null ? p.id : p;
      return {
        p,
        id,
        c: byeCounts[id] ?? 0,
        last: lastBye[id] ?? 0,
      };
    });
    const levels = [...new Set(counts.map(function (x) { return x.c; }))].sort(function (a, b) { return a - b; });
    let pool = [];
    for (let L = 0; L < levels.length; L++) {
      pool = pool.concat(counts.filter(function (x) { return x.c === levels[L]; }));
      if (pool.length >= byesNeeded) break;
    }
    pool.sort(function (a, b) { return a.c !== b.c ? a.c - b.c : a.last - b.last; });
    const byePlayers = pool.slice(0, byesNeeded).map(function (x) { return x.p; });
    const byeSet = new Set(byePlayers.map(function (p) { return p.id != null ? p.id : p; }));
    const active = players.filter(function (p) { return !byeSet.has(p.id != null ? p.id : p); });
    byePlayers.forEach(function (p) {
      const id = p.id != null ? p.id : p;
      byeCounts[id] = (byeCounts[id] || 0) + 1;
      lastBye[id] = roundNum;
    });
    return {
      active,
      byes: byePlayers,
      state: { ...state, playerByeCounts: byeCounts, playerLastByeRound: lastBye },
    };
  }

  function buildPartnerDebugReport(active, usedIdSet, baseHistory) {
    const remaining = active.filter(function (p) { return !usedIdSet.has(p.id); });
    const historySize = Object.keys(baseHistory).length;
    const legalCounts = remaining.map(function (p) {
      let count = 0;
      remaining.forEach(function (q) {
        if (q.id === p.id) return;
        if (!baseHistory[normalizePairKey(p.id, q.id)]) count++;
      });
      return { name: p.name != null ? p.name : p.id, id: p.id, count: count };
    });
    return {
      remainingNames: remaining.map(function (p) { return p.name != null ? p.name : p.id; }),
      remainingIds: remaining.map(function (p) { return p.id; }),
      legalCounts: legalCounts,
      historySize: historySize,
    };
  }

  function generateRandomRoundMatches(players, courtCount, config, roundNum, opts) {
    opts = opts || {};
    const maxRetries = opts.maxRetries != null ? opts.maxRetries : 500;
    const strictNoRepeat = opts.strictNoRepeat !== false;
    const baseHistory = { ...(config.partnerHistory || {}) };
    const capacity = courtCount * 4;
    const playerList = players.map(function (p) {
      return typeof p === "string" ? { id: p, name: p } : { ...p };
    });
    const pickResult = pickByes(playerList, capacity, config, roundNum);
    const active = pickResult.active;
    const byes = pickResult.byes;
    const state = pickResult.state;
    let committedHistory = null;
    let pairs = [];
    for (let tryNum = 0; tryNum < maxRetries; tryNum++) {
      const shuffled = shuffleArray(active.slice());
      const usedThisRound = new Set();
      pairs = [];
      let stuck = false;
      for (let i = 0; i < shuffled.length; i++) {
        if (usedThisRound.has(shuffled[i].id)) continue;
        const p1 = shuffled[i];
        let p2 = null;
        for (let j = 0; j < shuffled.length; j++) {
          if (i === j || usedThisRound.has(shuffled[j].id)) continue;
          const key = normalizePairKey(p1.id, shuffled[j].id);
          if (!baseHistory[key]) {
            p2 = shuffled[j];
            break;
          }
        }
        if (p2 === null) {
          const report = buildPartnerDebugReport(active, usedThisRound, baseHistory);
          report.round = roundNum;
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[Pairing] No legal partner for " + (p1.name != null ? p1.name : p1.id) + " (round " + roundNum + "). Debug report:", report);
          }
          stuck = true;
          break;
        }
        usedThisRound.add(p1.id);
        usedThisRound.add(p2.id);
        pairs.push([p1, p2]);
      }
      if (!stuck && pairs.length === active.length / 2) {
        committedHistory = { ...baseHistory };
        pairs.forEach(function (pair) {
          const a = pair[0], b = pair[1];
          committedHistory[normalizePairKey(a.id, b.id)] = true;
        });
        break;
      }
    }
    if (committedHistory == null) {
      return { impossible: true };
    }
    const nextConfig = {
      ...config,
      partnerHistory: committedHistory,
      playerByeCounts: state.playerByeCounts,
      playerLastByeRound: state.playerLastByeRound,
    };
    nextConfig.repeatPairsUsedThisRound = 0;
    const matches = [];
    for (let ci = 0; ci < courtCount; ci++) {
      const i = ci * 2, j = ci * 2 + 1;
      if (i >= pairs.length || j >= pairs.length) break;
      const a = pairs[i][0], b = pairs[i][1], p3 = pairs[j][0], p4 = pairs[j][1];
      matches.push({
        team1: (a.name != null ? a.name : a.id) + " \u0026 " + (b.name != null ? b.name : b.id),
        team2: (p3.name != null ? p3.name : p3.id) + " \u0026 " + (p4.name != null ? p4.name : p4.id),
        winner: null,
        court: ci + 1,
        round: roundNum,
      });
    }
    return {
      matches: matches,
      pairs: pairs.map(function (pair) { return [pair[0].id, pair[1].id]; }),
      config: nextConfig,
      byePlayers: byes,
      usedRepeat: false,
    };
  }

  return {
    normalizePairKey: normalizePairKey,
    parsePairLabel: parsePairLabel,
    pickByes: pickByes,
    buildPartnerDebugReport: buildPartnerDebugReport,
    generateRandomRoundMatches: generateRandomRoundMatches,
  };
});
