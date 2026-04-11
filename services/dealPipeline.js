/**
 * Deal Pipeline Tracker Service
 * Investment sourcing funnel, stage management, analytics:
 *   - Pipeline stages: Sourced → Screened → Due Diligence → IC Review → Closed
 *   - Source attribution (broker, direct, inbound, network, proprietary)
 *   - Probability weighting & expected deployment
 *   - Conversion rate analytics at each stage
 *   - Time-in-stage tracking & velocity
 *   - Sector, geography, size analysis
 *   - IC (Investment Committee) meeting preparation
 */

class DealPipelineService {

  constructor() {
    this.stages = [
      { id: 'SOURCED',        name: 'Sourced',         order: 1, color: '#6c757d' },
      { id: 'SCREENED',       name: 'Screened',        order: 2, color: '#17a2b8' },
      { id: 'PRELIMINARY_DD', name: 'Preliminary DD',  order: 3, color: '#ffc107' },
      { id: 'FULL_DD',        name: 'Full Due Diligence', order: 4, color: '#fd7e14' },
      { id: 'IC_REVIEW',      name: 'IC Review',       order: 5, color: '#007bff' },
      { id: 'TERM_SHEET',     name: 'Term Sheet',      order: 6, color: '#6f42c1' },
      { id: 'CLOSING',        name: 'Closing',         order: 7, color: '#28a745' },
      { id: 'CLOSED',         name: 'Closed',          order: 8, color: '#155724' },
      { id: 'PASSED',         name: 'Passed',          order: 99, color: '#dc3545' },
      { id: 'DEAD',           name: 'Dead',            order: 100, color: '#6c757d' }
    ];
  }

  // ==================== PIPELINE DASHBOARD ====================

  /**
   * Full pipeline dashboard with funnel, analytics, and active deals
   */
  getDashboard(deals) {
    const active = deals.filter(d => !['CLOSED', 'PASSED', 'DEAD'].includes(d.stage));
    const closed = deals.filter(d => d.stage === 'CLOSED');
    const passed = deals.filter(d => d.stage === 'PASSED' || d.stage === 'DEAD');

    return {
      summary: {
        totalDeals: deals.length,
        activeDeals: active.length,
        closedDeals: closed.length,
        passedDeals: passed.length,
        totalPipelineValue: active.reduce((s, d) => s + (d.targetSize || 0), 0),
        weightedPipelineValue: active.reduce((s, d) => s + (d.targetSize || 0) * (d.probability || 0) / 100, 0),
        avgDealSize: active.length > 0 ? Math.round(active.reduce((s, d) => s + (d.targetSize || 0), 0) / active.length) : 0
      },

      funnel: this._buildFunnel(deals),
      conversionRates: this._conversionRates(deals),
      sourceAttribution: this._sourceAttribution(deals),
      activeDeals: this._formatActiveDeals(active),
      velocity: this._stageVelocity(deals),
      sectorBreakdown: this._groupByField(active, 'sector', 'targetSize'),
      geographyBreakdown: this._groupByField(active, 'geography', 'targetSize'),
      sizeBreakdown: this._sizeDistribution(active),
      recentActivity: this._recentActivity(deals)
    };
  }

  // ==================== FUNNEL ====================

  _buildFunnel(deals) {
    const stageCounts = {};
    for (const stage of this.stages) {
      stageCounts[stage.id] = {
        name: stage.name,
        count: 0,
        totalValue: 0,
        weightedValue: 0,
        color: stage.color,
        order: stage.order
      };
    }

    for (const deal of deals) {
      const stageData = stageCounts[deal.stage];
      if (stageData) {
        stageData.count++;
        stageData.totalValue += deal.targetSize || 0;
        stageData.weightedValue += (deal.targetSize || 0) * (deal.probability || 0) / 100;
      }
    }

    return Object.values(stageCounts)
      .filter(s => s.order < 99) // Exclude PASSED/DEAD from funnel
      .sort((a, b) => a.order - b.order);
  }

  // ==================== CONVERSION RATES ====================

  _conversionRates(deals) {
    const stageOrder = ['SOURCED', 'SCREENED', 'PRELIMINARY_DD', 'FULL_DD', 'IC_REVIEW', 'TERM_SHEET', 'CLOSING', 'CLOSED'];

    // Count deals that reached each stage (including those that passed through)
    const reachedStage = {};
    for (const stage of stageOrder) {
      reachedStage[stage] = 0;
    }

    for (const deal of deals) {
      const dealStageIdx = stageOrder.indexOf(deal.stage);
      const maxIdx = deal.stage === 'PASSED' || deal.stage === 'DEAD'
        ? stageOrder.indexOf(deal.passedAtStage || 'SOURCED')
        : dealStageIdx;

      for (let i = 0; i <= maxIdx; i++) {
        reachedStage[stageOrder[i]]++;
      }
    }

    const rates = [];
    for (let i = 1; i < stageOrder.length; i++) {
      const from = stageOrder[i - 1];
      const to = stageOrder[i];
      const rate = reachedStage[from] > 0
        ? parseFloat(((reachedStage[to] / reachedStage[from]) * 100).toFixed(1))
        : 0;
      rates.push({ from, to, fromCount: reachedStage[from], toCount: reachedStage[to], conversionRate: rate + '%' });
    }

    // Overall conversion
    const overallRate = reachedStage.SOURCED > 0
      ? parseFloat(((reachedStage.CLOSED / reachedStage.SOURCED) * 100).toFixed(1))
      : 0;

    return {
      stageConversions: rates,
      overallConversion: overallRate + '%',
      sourced: reachedStage.SOURCED,
      closed: reachedStage.CLOSED
    };
  }

  // ==================== SOURCE ATTRIBUTION ====================

  _sourceAttribution(deals) {
    const sources = {};
    for (const deal of deals) {
      const src = deal.source || 'Unknown';
      if (!sources[src]) sources[src] = { count: 0, closed: 0, totalValue: 0, closedValue: 0 };
      sources[src].count++;
      sources[src].totalValue += deal.targetSize || 0;
      if (deal.stage === 'CLOSED') {
        sources[src].closed++;
        sources[src].closedValue += deal.actualSize || deal.targetSize || 0;
      }
    }

    return Object.entries(sources).map(([source, data]) => ({
      source,
      ...data,
      conversionRate: data.count > 0 ? parseFloat(((data.closed / data.count) * 100).toFixed(1)) + '%' : '0%',
      avgDealSize: data.count > 0 ? Math.round(data.totalValue / data.count) : 0
    })).sort((a, b) => b.closedValue - a.closedValue);
  }

  // ==================== STAGE VELOCITY ====================

  _stageVelocity(deals) {
    const closedDeals = deals.filter(d => d.stage === 'CLOSED' && d.stageHistory);
    if (closedDeals.length === 0) return { available: false };

    const avgDays = {};
    const stageOrder = ['SOURCED', 'SCREENED', 'PRELIMINARY_DD', 'FULL_DD', 'IC_REVIEW', 'TERM_SHEET', 'CLOSING', 'CLOSED'];

    for (const stage of stageOrder) {
      const durations = closedDeals
        .map(d => {
          const entry = (d.stageHistory || []).find(h => h.stage === stage);
          const exit = (d.stageHistory || []).find(h => h.stage === stageOrder[stageOrder.indexOf(stage) + 1]);
          if (entry && exit) {
            return Math.floor((new Date(exit.enteredAt) - new Date(entry.enteredAt)) / (1000 * 60 * 60 * 24));
          }
          return null;
        })
        .filter(Boolean);

      avgDays[stage] = durations.length > 0
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : null;
    }

    const totalDays = closedDeals.map(d => {
      const first = d.stageHistory?.[0]?.enteredAt;
      const last = d.closedAt || d.stageHistory?.[d.stageHistory.length - 1]?.enteredAt;
      return first && last ? Math.floor((new Date(last) - new Date(first)) / (1000 * 60 * 60 * 24)) : null;
    }).filter(Boolean);

    return {
      available: true,
      avgDaysPerStage: avgDays,
      avgTotalDaysToClose: totalDays.length > 0 ? Math.round(totalDays.reduce((s, d) => s + d, 0) / totalDays.length) : null,
      medianDaysToClose: totalDays.length > 0 ? totalDays.sort((a, b) => a - b)[Math.floor(totalDays.length / 2)] : null,
      sampleSize: closedDeals.length
    };
  }

  // ==================== DEAL MANAGEMENT ====================

  /**
   * Create a new deal in the pipeline
   */
  createDeal(deal) {
    const now = new Date().toISOString();
    return {
      id: `DEAL-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      ...deal,
      stage: deal.stage || 'SOURCED',
      probability: deal.probability || this._defaultProbability('SOURCED'),
      createdAt: now,
      updatedAt: now,
      stageHistory: [{ stage: deal.stage || 'SOURCED', enteredAt: now, exitedAt: null }],
      notes: deal.notes || [],
      status: 'ACTIVE'
    };
  }

  /**
   * Advance deal to next stage
   */
  advanceDeal(deal, newStage, note) {
    const now = new Date().toISOString();

    // Close current stage
    const currentStageEntry = deal.stageHistory.find(h => h.exitedAt === null);
    if (currentStageEntry) currentStageEntry.exitedAt = now;

    // Enter new stage
    deal.stageHistory.push({ stage: newStage, enteredAt: now, exitedAt: null });
    deal.stage = newStage;
    deal.probability = deal.probability || this._defaultProbability(newStage);
    deal.updatedAt = now;

    if (note) {
      deal.notes.push({ date: now, author: note.author, text: note.text, stage: newStage });
    }

    if (newStage === 'CLOSED') {
      deal.closedAt = now;
      deal.probability = 100;
    }
    if (newStage === 'PASSED' || newStage === 'DEAD') {
      deal.passedAtStage = currentStageEntry?.stage;
      deal.passReason = note?.text || 'No reason provided';
    }

    return deal;
  }

  /**
   * Generate IC memo summary for a deal
   */
  generateIcMemoSummary(deal) {
    return {
      dealName: deal.name,
      sector: deal.sector,
      geography: deal.geography,
      source: deal.source,
      stage: deal.stage,

      investment: {
        targetSize: deal.targetSize,
        evAtEntry: deal.evAtEntry,
        entryMultiple: deal.entryMultiple,
        instrumentType: deal.instrumentType, // Equity, Convertible, Preferred, Debt
        ownershipPct: deal.ownershipPct,
        boardSeat: deal.boardSeat
      },

      company: {
        description: deal.companyDescription,
        revenue: deal.revenue,
        ebitda: deal.ebitda,
        revenueGrowth: deal.revenueGrowth,
        headcount: deal.headcount,
        founded: deal.founded
      },

      thesis: deal.investmentThesis,
      risks: deal.keyRisks || [],
      mitigants: deal.mitigants || [],

      timeline: {
        daysInPipeline: deal.stageHistory?.[0]?.enteredAt
          ? Math.floor((new Date() - new Date(deal.stageHistory[0].enteredAt)) / (1000 * 60 * 60 * 24))
          : null,
        expectedClose: deal.expectedClose,
        exclusivityExpiry: deal.exclusivityExpiry
      },

      exitScenarios: deal.exitScenarios || [],
      returnAnalysis: deal.returnAnalysis || null,
      competitiveDynamics: deal.competitiveDynamics || null,

      stageHistory: deal.stageHistory,
      notes: deal.notes
    };
  }

  // ==================== HELPERS ====================

  _defaultProbability(stage) {
    const probs = { SOURCED: 5, SCREENED: 10, PRELIMINARY_DD: 20, FULL_DD: 40, IC_REVIEW: 60, TERM_SHEET: 75, CLOSING: 90, CLOSED: 100, PASSED: 0, DEAD: 0 };
    return probs[stage] || 5;
  }

  _formatActiveDeals(deals) {
    return deals
      .sort((a, b) => {
        const stageOrder = { CLOSING: 0, TERM_SHEET: 1, IC_REVIEW: 2, FULL_DD: 3, PRELIMINARY_DD: 4, SCREENED: 5, SOURCED: 6 };
        return (stageOrder[a.stage] || 99) - (stageOrder[b.stage] || 99);
      })
      .map(d => ({
        id: d.id,
        name: d.name,
        sector: d.sector,
        geography: d.geography,
        stage: d.stage,
        targetSize: d.targetSize,
        probability: d.probability + '%',
        weightedValue: Math.round((d.targetSize || 0) * (d.probability || 0) / 100),
        source: d.source,
        daysInPipeline: d.stageHistory?.[0]?.enteredAt
          ? Math.floor((new Date() - new Date(d.stageHistory[0].enteredAt)) / (1000 * 60 * 60 * 24))
          : null,
        daysInCurrentStage: d.stageHistory?.find(h => !h.exitedAt)?.enteredAt
          ? Math.floor((new Date() - new Date(d.stageHistory.find(h => !h.exitedAt).enteredAt)) / (1000 * 60 * 60 * 24))
          : null,
        expectedClose: d.expectedClose,
        dealLead: d.dealLead
      }));
  }

  _groupByField(deals, field, valueField) {
    const groups = {};
    for (const deal of deals) {
      const key = deal[field] || 'Other';
      if (!groups[key]) groups[key] = { count: 0, totalValue: 0 };
      groups[key].count++;
      groups[key].totalValue += deal[valueField] || 0;
    }
    return Object.entries(groups)
      .map(([key, data]) => ({ [field]: key, ...data }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }

  _sizeDistribution(deals) {
    const buckets = { '<$5M': 0, '$5-15M': 0, '$15-30M': 0, '$30-50M': 0, '$50-100M': 0, '>$100M': 0 };
    for (const deal of deals) {
      const size = deal.targetSize || 0;
      if (size < 5000000) buckets['<$5M']++;
      else if (size < 15000000) buckets['$5-15M']++;
      else if (size < 30000000) buckets['$15-30M']++;
      else if (size < 50000000) buckets['$30-50M']++;
      else if (size < 100000000) buckets['$50-100M']++;
      else buckets['>$100M']++;
    }
    return buckets;
  }

  _recentActivity(deals) {
    const activities = [];
    for (const deal of deals) {
      for (const entry of (deal.stageHistory || [])) {
        activities.push({
          date: entry.enteredAt,
          dealName: deal.name,
          action: `Moved to ${entry.stage}`,
          dealId: deal.id
        });
      }
    }
    return activities.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30);
  }
}

module.exports = new DealPipelineService();
