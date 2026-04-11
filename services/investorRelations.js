/**
 * Investor Relations Metrics Service
 * LP retention, re-up rates, NPS, interaction tracking,
 * fundraising pipeline, LP segmentation, reporting quality metrics.
 */

class InvestorRelationsService {

  /**
   * Calculate LP retention rate across fund generations
   */
  calculateRetention({ currentFundLps, priorFundLps }) {
    const priorIds = new Set(priorFundLps.map(lp => lp.id));
    const reUps = currentFundLps.filter(lp => priorIds.has(lp.id));
    const newLps = currentFundLps.filter(lp => !priorIds.has(lp.id));

    const priorCapital = priorFundLps.reduce((sum, lp) => sum + lp.commitment, 0);
    const reUpCapital = reUps.reduce((sum, lp) => {
      const prior = priorFundLps.find(p => p.id === lp.id);
      return sum + lp.commitment;
    }, 0);
    const priorReUpCapital = priorFundLps
      .filter(lp => reUps.some(r => r.id === lp.id))
      .reduce((sum, lp) => sum + lp.commitment, 0);

    return {
      priorFundLpCount: priorFundLps.length,
      currentFundLpCount: currentFundLps.length,
      reUpCount: reUps.length,
      newLpCount: newLps.length,
      retentionRate: parseFloat(((reUps.length / priorFundLps.length) * 100).toFixed(1)) + '%',
      retentionByCapital: parseFloat(((reUpCapital / priorCapital) * 100).toFixed(1)) + '%',
      averageReUpRatio: priorReUpCapital > 0
        ? parseFloat(((reUpCapital / priorReUpCapital) * 100).toFixed(1)) + '%'
        : 'N/A',
      reUps: reUps.map(lp => {
        const prior = priorFundLps.find(p => p.id === lp.id);
        return {
          name: lp.name,
          priorCommitment: prior.commitment,
          newCommitment: lp.commitment,
          change: parseFloat(((lp.commitment / prior.commitment - 1) * 100).toFixed(1)) + '%',
          increased: lp.commitment > prior.commitment
        };
      }),
      lostLps: priorFundLps
        .filter(lp => !reUps.some(r => r.id === lp.id))
        .map(lp => ({ name: lp.name, priorCommitment: lp.commitment, reason: lp.nonReUpReason || 'Unknown' })),
      newLps: newLps.map(lp => ({ name: lp.name, commitment: lp.commitment, source: lp.referralSource }))
    };
  }

  /**
   * Calculate NPS (Net Promoter Score)
   */
  calculateNps(surveyResponses) {
    const promoters = surveyResponses.filter(r => r.score >= 9).length;
    const passives = surveyResponses.filter(r => r.score >= 7 && r.score <= 8).length;
    const detractors = surveyResponses.filter(r => r.score <= 6).length;
    const total = surveyResponses.length;

    const nps = ((promoters / total) - (detractors / total)) * 100;

    return {
      totalResponses: total,
      responseRate: surveyResponses.length > 0
        ? parseFloat(((total / (surveyResponses[0]?.totalSurveyed || total)) * 100).toFixed(1)) + '%'
        : 'N/A',
      promoters: { count: promoters, pct: parseFloat(((promoters / total) * 100).toFixed(1)) + '%' },
      passives: { count: passives, pct: parseFloat(((passives / total) * 100).toFixed(1)) + '%' },
      detractors: { count: detractors, pct: parseFloat(((detractors / total) * 100).toFixed(1)) + '%' },
      nps: parseFloat(nps.toFixed(0)),
      benchmark: nps >= 70 ? 'WORLD_CLASS' : nps >= 50 ? 'EXCELLENT' : nps >= 30 ? 'GOOD' : nps >= 0 ? 'NEEDS_IMPROVEMENT' : 'CRITICAL',
      topFeedback: surveyResponses
        .filter(r => r.comment)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(r => ({ score: r.score, type: r.investorType, comment: r.comment }))
    };
  }

  /**
   * LP satisfaction survey analysis
   */
  analyzeSatisfaction(surveyResponses) {
    const categories = [
      'communicationQuality', 'reportingTimeliness', 'reportingDetail',
      'responsiveness', 'transparency', 'overallSatisfaction'
    ];

    const analysis = {};
    for (const cat of categories) {
      const scores = surveyResponses.map(r => r[cat]).filter(Boolean);
      if (scores.length === 0) continue;
      analysis[cat] = {
        average: parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2)),
        median: scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)],
        min: Math.min(...scores),
        max: Math.max(...scores),
        responses: scores.length,
        distribution: {
          '9-10': scores.filter(s => s >= 9).length,
          '7-8': scores.filter(s => s >= 7 && s < 9).length,
          '5-6': scores.filter(s => s >= 5 && s < 7).length,
          '1-4': scores.filter(s => s < 5).length
        }
      };
    }

    // By investor type
    const byType = {};
    for (const r of surveyResponses) {
      if (!byType[r.investorType]) byType[r.investorType] = [];
      byType[r.investorType].push(r.overallSatisfaction);
    }

    return {
      responseCount: surveyResponses.length,
      categories: analysis,
      byInvestorType: Object.entries(byType).map(([type, scores]) => ({
        type,
        avgSatisfaction: parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2)),
        count: scores.length
      })),
      lowestScoringCategory: Object.entries(analysis)
        .sort(([, a], [, b]) => a.average - b.average)[0]?.[0],
      actionItems: this._generateActionItems(analysis)
    };
  }

  /**
   * Fundraising pipeline tracker
   */
  trackFundraisingPipeline(prospects) {
    const stages = ['INTRODUCTION', 'DDQ_SENT', 'MEETING', 'ONSITE_DD', 'IC_APPROVAL', 'SOFT_CIRCLE', 'HARD_COMMIT', 'CLOSED'];
    const pipeline = {};

    for (const stage of stages) {
      const stageProspects = prospects.filter(p => p.stage === stage);
      pipeline[stage] = {
        count: stageProspects.length,
        totalCommitment: stageProspects.reduce((sum, p) => sum + (p.expectedCommitment || 0), 0),
        prospects: stageProspects.map(p => ({
          name: p.name,
          type: p.investorType,
          expectedCommitment: p.expectedCommitment,
          probability: p.probability,
          weightedCommitment: parseFloat(((p.expectedCommitment || 0) * (p.probability || 0)).toFixed(2)),
          lastContact: p.lastContactDate,
          nextStep: p.nextStep
        }))
      };
    }

    // Conversion rates
    const conversionRates = {};
    for (let i = 0; i < stages.length - 1; i++) {
      const current = pipeline[stages[i]].count + pipeline[stages[i + 1]].count; // Simplified
      const next = pipeline[stages[i + 1]].count;
      conversionRates[`${stages[i]} → ${stages[i + 1]}`] = current > 0
        ? parseFloat(((next / Math.max(current, 1)) * 100).toFixed(1)) + '%'
        : 'N/A';
    }

    const totalWeighted = prospects.reduce((sum, p) => sum + (p.expectedCommitment || 0) * (p.probability || 0), 0);
    const hardCommits = prospects.filter(p => p.stage === 'HARD_COMMIT' || p.stage === 'CLOSED');
    const totalClosed = hardCommits.reduce((sum, p) => sum + (p.expectedCommitment || 0), 0);

    return {
      totalProspects: prospects.length,
      pipeline,
      conversionRates,
      weightedPipeline: parseFloat(totalWeighted.toFixed(2)),
      hardCommitments: parseFloat(totalClosed.toFixed(2)),
      byInvestorType: this._groupByType(prospects),
      byGeography: this._groupByGeo(prospects)
    };
  }

  /**
   * LP concentration risk analysis
   */
  concentrationAnalysis(investors) {
    const totalCommitment = investors.reduce((sum, lp) => sum + lp.commitment, 0);
    const sorted = [...investors].sort((a, b) => b.commitment - a.commitment);

    const top5 = sorted.slice(0, 5);
    const top10 = sorted.slice(0, 10);

    // Herfindahl index
    const hhi = investors.reduce((sum, lp) => {
      const share = lp.commitment / totalCommitment;
      return sum + share * share;
    }, 0);

    return {
      totalLps: investors.length,
      totalCommitment,
      top5: {
        names: top5.map(lp => lp.name),
        totalCommitment: top5.reduce((sum, lp) => sum + lp.commitment, 0),
        pctOfFund: parseFloat(((top5.reduce((sum, lp) => sum + lp.commitment, 0) / totalCommitment) * 100).toFixed(1)) + '%'
      },
      top10: {
        totalCommitment: top10.reduce((sum, lp) => sum + lp.commitment, 0),
        pctOfFund: parseFloat(((top10.reduce((sum, lp) => sum + lp.commitment, 0) / totalCommitment) * 100).toFixed(1)) + '%'
      },
      herfindahlIndex: parseFloat(hhi.toFixed(6)),
      concentrationRisk: top5.reduce((sum, lp) => sum + lp.commitment, 0) / totalCommitment > 0.40
        ? 'HIGH — Top 5 LPs exceed 40% of fund'
        : top5.reduce((sum, lp) => sum + lp.commitment, 0) / totalCommitment > 0.30
        ? 'MODERATE — Top 5 LPs between 30-40% of fund'
        : 'LOW — Well diversified',
      largestLp: {
        name: sorted[0]?.name,
        commitment: sorted[0]?.commitment,
        pctOfFund: parseFloat(((sorted[0]?.commitment / totalCommitment) * 100).toFixed(1)) + '%'
      },
      byType: this._segmentByType(investors, totalCommitment),
      byGeography: this._segmentByGeo(investors, totalCommitment)
    };
  }

  /**
   * Reporting quality metrics
   */
  reportingQualityMetrics(reports) {
    const quarterlyReports = reports.filter(r => r.type === 'QUARTERLY');

    const timeliness = quarterlyReports.map(r => {
      const quarterEnd = new Date(r.quarterEnd);
      const deliveryDate = new Date(r.deliveryDate);
      return Math.floor((deliveryDate - quarterEnd) / (1000 * 60 * 60 * 24));
    });

    const avgLag = timeliness.reduce((sum, d) => sum + d, 0) / timeliness.length;

    return {
      totalReports: reports.length,
      quarterlyReports: quarterlyReports.length,
      timeliness: {
        averageLagDays: parseFloat(avgLag.toFixed(1)),
        target: 60,
        meetsTarget: avgLag <= 60,
        fastest: Math.min(...timeliness),
        slowest: Math.max(...timeliness),
        trend: timeliness.length >= 2 ? (timeliness[timeliness.length - 1] < timeliness[0] ? 'IMPROVING' : 'DECLINING') : 'INSUFFICIENT_DATA'
      },
      restatements: reports.filter(r => r.restated).length,
      restatementRate: parseFloat(((reports.filter(r => r.restated).length / reports.length) * 100).toFixed(1)) + '%',
      ilpaCompliance: {
        templateUsed: reports.filter(r => r.ilpaCompliant).length,
        complianceRate: parseFloat(((reports.filter(r => r.ilpaCompliant).length / reports.length) * 100).toFixed(1)) + '%'
      }
    };
  }

  // --- Private ---

  _generateActionItems(analysis) {
    const items = [];
    for (const [cat, data] of Object.entries(analysis)) {
      if (data.average < 7) {
        items.push({
          category: cat,
          currentScore: data.average,
          action: `Improve ${cat.replace(/([A-Z])/g, ' $1').toLowerCase()} — score is below 7.0`,
          priority: data.average < 5 ? 'HIGH' : 'MEDIUM'
        });
      }
    }
    return items;
  }

  _groupByType(prospects) {
    const groups = {};
    for (const p of prospects) {
      if (!groups[p.investorType]) groups[p.investorType] = { count: 0, totalExpected: 0 };
      groups[p.investorType].count++;
      groups[p.investorType].totalExpected += p.expectedCommitment || 0;
    }
    return groups;
  }

  _groupByGeo(prospects) {
    const groups = {};
    for (const p of prospects) {
      const geo = p.geography || 'Unknown';
      if (!groups[geo]) groups[geo] = { count: 0, totalExpected: 0 };
      groups[geo].count++;
      groups[geo].totalExpected += p.expectedCommitment || 0;
    }
    return groups;
  }

  _segmentByType(investors, total) {
    const groups = {};
    for (const lp of investors) {
      if (!groups[lp.type]) groups[lp.type] = { count: 0, totalCommitment: 0 };
      groups[lp.type].count++;
      groups[lp.type].totalCommitment += lp.commitment;
    }
    return Object.entries(groups).map(([type, data]) => ({
      type,
      ...data,
      pctOfFund: parseFloat(((data.totalCommitment / total) * 100).toFixed(1)) + '%'
    })).sort((a, b) => b.totalCommitment - a.totalCommitment);
  }

  _segmentByGeo(investors, total) {
    const groups = {};
    for (const lp of investors) {
      const geo = lp.geography || 'Unknown';
      if (!groups[geo]) groups[geo] = { count: 0, totalCommitment: 0 };
      groups[geo].count++;
      groups[geo].totalCommitment += lp.commitment;
    }
    return Object.entries(groups).map(([geo, data]) => ({
      geography: geo,
      ...data,
      pctOfFund: parseFloat(((data.totalCommitment / total) * 100).toFixed(1)) + '%'
    })).sort((a, b) => b.totalCommitment - a.totalCommitment);
  }
}

module.exports = new InvestorRelationsService();
