/**
 * Tax Calculations Engine
 * Agent: Mila (CFO/Reporting)
 *
 * Core calculation functions for partner income allocation, carried interest,
 * effectively connected income, withholding, capital accounts, and waterfall
 * distributions. Follows US GAAP / IFRS conventions where applicable.
 */

'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _round(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function _sum(arr) {
  return arr.reduce((total, v) => total + (v || 0), 0);
}

/**
 * Validate that ownership percentages sum to ~100%.
 */
function _validateOwnership(partners) {
  const total = _sum(partners.map((p) => p.ownershipPct || 0));
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(
      `Partner ownership percentages sum to ${total}%, expected 100%.`
    );
  }
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Allocate fund-level income to each partner based on ownership percentage.
 *
 * @param {object} fundIncome - Fund-level income breakdown
 *   { ordinaryIncome, capitalGainsShortTerm, capitalGainsLongTerm, losses,
 *     interestIncome, dividendIncome, foreignTaxesPaid, otherIncome }
 * @param {object[]} partners - Array of partner objects
 *   { partnerId, partnerName, ownershipPct }
 * @returns {object[]} Per-partner allocation records
 */
function allocatePartnerIncome(fundIncome, partners) {
  _validateOwnership(partners);

  const incomeKeys = [
    'ordinaryIncome',
    'capitalGainsShortTerm',
    'capitalGainsLongTerm',
    'losses',
    'interestIncome',
    'dividendIncome',
    'foreignTaxesPaid',
    'otherIncome',
  ];

  return partners.map((partner) => {
    const pct = partner.ownershipPct || 0;
    const allocation = {};

    for (const key of incomeKeys) {
      allocation[key] = _round((fundIncome[key] || 0) * (pct / 100));
    }

    allocation.totalAllocatedIncome = _round(
      (allocation.ordinaryIncome || 0) +
      (allocation.capitalGainsShortTerm || 0) +
      (allocation.capitalGainsLongTerm || 0) +
      (allocation.interestIncome || 0) +
      (allocation.dividendIncome || 0) +
      (allocation.otherIncome || 0) -
      Math.abs(allocation.losses || 0)
    );

    return {
      partnerId: partner.partnerId,
      partnerName: partner.partnerName,
      ownershipPct: pct,
      allocation,
    };
  });
}

/**
 * Calculate carried interest using a standard waterfall structure.
 *
 * GP earns carry only after LPs achieve the hurdle rate (preferred return).
 * After the hurdle is met, the GP receives a catch-up allocation until the
 * GP has received its target carry percentage of total profits. Remaining
 * profits are split at the carry rate.
 *
 * @param {number} fundReturns - Total fund profit (net gains above invested capital)
 * @param {number} hurdleRate - Preferred return rate (e.g. 0.08 for 8%)
 * @param {number} carryRate - Carried interest rate (e.g. 0.20 for 20%)
 * @param {number} catchUpRate - GP catch-up rate (e.g. 1.0 for 100% catch-up, 0.80 for 80/20)
 * @param {number} [investedCapital=0] - Total invested capital (used to compute hurdle amount)
 * @returns {object} { carriedInterest, lpShare, gpShare, breakdown }
 */
function calculateCarriedInterest(fundReturns, hurdleRate, carryRate, catchUpRate, investedCapital = 0) {
  if (fundReturns <= 0) {
    return {
      carriedInterest: 0,
      lpShare: fundReturns,
      gpShare: 0,
      breakdown: {
        hurdleAmount: 0,
        catchUpAmount: 0,
        remainingSplit: 0,
        totalProfit: fundReturns,
      },
    };
  }

  // Step 1: Preferred return (hurdle)
  const hurdleAmount = _round(investedCapital * hurdleRate);
  let remaining = fundReturns;
  let lpTotal = 0;
  let gpTotal = 0;

  // Tier 1: 100% to LPs until hurdle is met
  const tier1 = Math.min(remaining, hurdleAmount);
  lpTotal += tier1;
  remaining -= tier1;

  // Tier 2: Catch-up – GP receives catchUpRate of profits until GP has
  // received carryRate of all cumulative distributions
  let catchUpAmount = 0;
  if (remaining > 0 && catchUpRate > 0) {
    // GP needs to "catch up" so its total share = carryRate of total profits
    // Target GP share = carryRate * (hurdleAmount + catchUp) / (1 - carryRate) ... simplified:
    const targetGPTotal = _round((carryRate / (1 - carryRate)) * tier1);
    const maxCatchUp = Math.min(remaining, targetGPTotal);

    const gpCatchUp = _round(maxCatchUp * catchUpRate);
    const lpCatchUp = _round(maxCatchUp - gpCatchUp);

    gpTotal += gpCatchUp;
    lpTotal += lpCatchUp;
    catchUpAmount = maxCatchUp;
    remaining -= maxCatchUp;
  }

  // Tier 3: Remaining split at carry rate
  let remainingSplitAmount = 0;
  if (remaining > 0) {
    const gpSplit = _round(remaining * carryRate);
    const lpSplit = _round(remaining * (1 - carryRate));
    gpTotal += gpSplit;
    lpTotal += lpSplit;
    remainingSplitAmount = remaining;
  }

  const carriedInterest = _round(gpTotal);

  return {
    carriedInterest,
    lpShare: _round(lpTotal),
    gpShare: carriedInterest,
    breakdown: {
      hurdleAmount: _round(tier1),
      catchUpAmount: _round(catchUpAmount),
      remainingSplit: _round(remainingSplitAmount),
      totalProfit: _round(fundReturns),
    },
  };
}

/**
 * Calculate Effectively Connected Income (ECI) for a foreign partner,
 * used for Form 8804 / Section 1446 withholding.
 *
 * @param {object} foreignPartner
 *   { partnerId, partnerName, ownershipPct, country }
 * @param {object} fundIncome
 *   { ordinaryIncome, capitalGainsShortTerm, capitalGainsLongTerm,
 *     eciIncome, nonECIIncome }
 * @returns {object} { partnerId, eciAmount, nonECIAmount, applicableWithholdingRate, withholdingAmount }
 */
function calculateECI(foreignPartner, fundIncome) {
  const pct = foreignPartner.ownershipPct || 0;

  // ECI includes ordinary income and short-term capital gains connected to US trade/business
  const eciBase = (fundIncome.eciIncome != null)
    ? fundIncome.eciIncome
    : (fundIncome.ordinaryIncome || 0) + (fundIncome.capitalGainsShortTerm || 0);

  const nonECIBase = (fundIncome.nonECIIncome != null)
    ? fundIncome.nonECIIncome
    : (fundIncome.capitalGainsLongTerm || 0);

  const eciAmount = _round(eciBase * (pct / 100));
  const nonECIAmount = _round(nonECIBase * (pct / 100));

  // Section 1446 withholding rate:
  // - Individuals / non-corporate foreign partners: highest individual rate (37%)
  // - Corporate foreign partners: 21%
  const isCorporate = foreignPartner.type === 'entity' || foreignPartner.type === 'corporate';
  const withholdingRate = isCorporate ? 0.21 : 0.37;

  const withholdingAmount = _round(Math.max(0, eciAmount) * withholdingRate);

  return {
    partnerId: foreignPartner.partnerId,
    partnerName: foreignPartner.partnerName,
    country: foreignPartner.country,
    eciAmount,
    nonECIAmount,
    applicableWithholdingRate: withholdingRate,
    withholdingAmount,
  };
}

/**
 * Calculate withholding on a given income amount at a given rate.
 *
 * @param {number} income - Gross income amount
 * @param {number} rate - Withholding rate as a decimal (e.g. 0.30)
 * @returns {object} { grossIncome, withholdingRate, withholdingAmount, netIncome }
 */
function calculateWithholding(income, rate) {
  const withholdingAmount = _round(income * rate);
  return {
    grossIncome: _round(income),
    withholdingRate: rate,
    withholdingAmount,
    netIncome: _round(income - withholdingAmount),
  };
}

/**
 * Calculate a partner's capital account over a period.
 *
 * @param {object} partner
 *   { partnerId, partnerName, ownershipPct, beginningCapitalAccount }
 * @param {object[]} transactions - Chronological array of transactions
 *   { type ('contribution'|'distribution'|'incomeAllocation'|'lossAllocation'|'expense'),
 *     amount, date, description }
 * @returns {object} Capital account summary
 */
function calculateCapitalAccount(partner, transactions) {
  const beginning = partner.beginningCapitalAccount || 0;

  let contributions = 0;
  let distributions = 0;
  let incomeAllocations = 0;
  let lossAllocations = 0;
  let expenses = 0;

  const ledger = [];

  for (const txn of transactions) {
    const amount = txn.amount || 0;

    switch (txn.type) {
      case 'contribution':
        contributions += amount;
        break;
      case 'distribution':
        distributions += Math.abs(amount);
        break;
      case 'incomeAllocation':
        incomeAllocations += amount;
        break;
      case 'lossAllocation':
        lossAllocations += Math.abs(amount);
        break;
      case 'expense':
        expenses += Math.abs(amount);
        break;
      default:
        break;
    }

    ledger.push({
      date: txn.date,
      type: txn.type,
      description: txn.description || '',
      amount: _round(amount),
    });
  }

  const ending = _round(
    beginning + contributions + incomeAllocations - lossAllocations - distributions - expenses
  );

  return {
    partnerId: partner.partnerId,
    partnerName: partner.partnerName,
    beginningBalance: _round(beginning),
    contributions: _round(contributions),
    incomeAllocations: _round(incomeAllocations),
    lossAllocations: _round(lossAllocations),
    distributions: _round(distributions),
    expenses: _round(expenses),
    endingBalance: ending,
    ledger,
  };
}

/**
 * Perform a full waterfall allocation of total proceeds among partners.
 *
 * Standard 4-tier waterfall:
 *   Tier 1 – Return of Capital: return each partner's contributed capital
 *   Tier 2 – Preferred Return: distribute preferred return pro-rata by commitment
 *   Tier 3 – GP Catch-Up: GP receives catch-up until its share = carryRate of total profits
 *   Tier 4 – Carried Interest Split: remaining split at carryRate GP / (1-carryRate) LP
 *
 * @param {number} totalProceeds - Total amount available for distribution
 * @param {object[]} commitments - Partner commitments
 *   { partnerId, partnerName, commitment, contributedCapital, isGP }
 * @param {number} preferredReturn - Annual preferred return rate (e.g. 0.08)
 * @param {number} carryRate - GP carry rate (e.g. 0.20)
 * @param {object} [options] - { holdingPeriodYears: number, catchUpRate: number }
 * @returns {object} Waterfall result with per-partner breakdown
 */
function waterfallAllocation(totalProceeds, commitments, preferredReturn, carryRate, options = {}) {
  const holdingPeriodYears = options.holdingPeriodYears || 1;
  const catchUpRate = options.catchUpRate !== undefined ? options.catchUpRate : 1.0;

  const totalContributed = _sum(commitments.map((c) => c.contributedCapital || 0));
  let remaining = totalProceeds;

  // Initialize per-partner result
  const partnerResults = commitments.map((c) => ({
    partnerId: c.partnerId,
    partnerName: c.partnerName,
    commitment: c.commitment || 0,
    contributedCapital: c.contributedCapital || 0,
    isGP: !!c.isGP,
    tier1_returnOfCapital: 0,
    tier2_preferredReturn: 0,
    tier3_catchUp: 0,
    tier4_carriedInterestSplit: 0,
    totalDistribution: 0,
    multiple: 0,
  }));

  const lpPartners = partnerResults.filter((p) => !p.isGP);
  const gpPartners = partnerResults.filter((p) => p.isGP);

  // ---- Tier 1: Return of Capital ----
  for (const partner of partnerResults) {
    const returnAmount = Math.min(remaining, partner.contributedCapital);
    partner.tier1_returnOfCapital = _round(returnAmount);
    remaining = _round(remaining - returnAmount);
  }

  // ---- Tier 2: Preferred Return ----
  const totalLPContributed = _sum(lpPartners.map((p) => p.contributedCapital));
  const totalPreferredReturn = _round(totalLPContributed * preferredReturn * holdingPeriodYears);
  const tier2Pool = Math.min(remaining, totalPreferredReturn);

  for (const lp of lpPartners) {
    if (totalLPContributed === 0) continue;
    const share = lp.contributedCapital / totalLPContributed;
    lp.tier2_preferredReturn = _round(tier2Pool * share);
  }
  remaining = _round(remaining - tier2Pool);

  // ---- Tier 3: GP Catch-Up ----
  if (remaining > 0 && gpPartners.length > 0) {
    // GP needs to catch up so total GP profit = carryRate * total profit
    const totalLPProfit = tier2Pool; // LP profit so far (above return of capital)
    const targetGPShare = _round((carryRate / (1 - carryRate)) * totalLPProfit);
    const catchUpPool = Math.min(remaining, targetGPShare);

    const gpCount = gpPartners.length;
    for (const gp of gpPartners) {
      const gpCatchUp = _round((catchUpPool * catchUpRate) / gpCount);
      gp.tier3_catchUp = gpCatchUp;
    }
    // Any non-caught-up portion goes to LPs
    const lpCatchUpRemainder = _round(catchUpPool * (1 - catchUpRate));
    if (lpCatchUpRemainder > 0 && lpPartners.length > 0) {
      for (const lp of lpPartners) {
        if (totalLPContributed === 0) continue;
        const share = lp.contributedCapital / totalLPContributed;
        lp.tier3_catchUp = _round(lpCatchUpRemainder * share);
      }
    }
    remaining = _round(remaining - catchUpPool);
  }

  // ---- Tier 4: Carried Interest Split ----
  if (remaining > 0) {
    const gpPool = _round(remaining * carryRate);
    const lpPool = _round(remaining * (1 - carryRate));

    const gpCount = gpPartners.length || 1;
    for (const gp of gpPartners) {
      gp.tier4_carriedInterestSplit = _round(gpPool / gpCount);
    }

    for (const lp of lpPartners) {
      if (totalLPContributed === 0) continue;
      const share = lp.contributedCapital / totalLPContributed;
      lp.tier4_carriedInterestSplit = _round(lpPool * share);
    }
  }

  // ---- Totals ----
  for (const partner of partnerResults) {
    partner.totalDistribution = _round(
      partner.tier1_returnOfCapital +
      partner.tier2_preferredReturn +
      partner.tier3_catchUp +
      partner.tier4_carriedInterestSplit
    );
    partner.multiple = partner.contributedCapital > 0
      ? _round(partner.totalDistribution / partner.contributedCapital, 4)
      : 0;
  }

  const totalDistributed = _round(_sum(partnerResults.map((p) => p.totalDistribution)));

  return {
    totalProceeds: _round(totalProceeds),
    totalContributed: _round(totalContributed),
    preferredReturnRate: preferredReturn,
    carryRate,
    holdingPeriodYears,
    tiers: {
      tier1_returnOfCapital: _round(_sum(partnerResults.map((p) => p.tier1_returnOfCapital))),
      tier2_preferredReturn: _round(_sum(partnerResults.map((p) => p.tier2_preferredReturn))),
      tier3_catchUp: _round(_sum(partnerResults.map((p) => p.tier3_catchUp))),
      tier4_carriedInterestSplit: _round(_sum(partnerResults.map((p) => p.tier4_carriedInterestSplit))),
    },
    totalDistributed,
    undistributed: _round(totalProceeds - totalDistributed),
    partnerResults,
  };
}

module.exports = {
  allocatePartnerIncome,
  calculateCarriedInterest,
  calculateECI,
  calculateWithholding,
  calculateCapitalAccount,
  waterfallAllocation,
};
