/**
 * LP Re-Up Prediction Service
 * Scores LPs on re-investment likelihood using multi-factor model:
 * commitment size, fund performance, payment history, entity type,
 * multi-fund participation, and communication engagement.
 */

const db = require('../db/database');

// Scoring weights (must sum to 1.0)
const WEIGHTS = {
  commitmentSize: 0.20,
  fundPerformance: 0.30,
  paymentHistory: 0.15,
  entityType: 0.10,
  multipleCommitments: 0.15,
  communicationEngagement: 0.10
};

// Entity type scoring map
const ENTITY_TYPE_SCORES = {
  'Pension': 10,
  'Pension Fund': 10,
  'Endowment': 10,
  'Sovereign Wealth Fund': 10,
  'Family Office': 8,
  'Insurance Company': 7,
  'Fund of Funds': 7,
  'Foundation': 6,
  'Bank': 5,
  'Corporation': 4,
  'Individual': 3
};

// Recommendation thresholds
const THRESHOLDS = {
  HIGH_PRIORITY: 70,
  MEDIUM_PRIORITY: 50,
  LOW_PRIORITY: 30
  // Below 30 = AT_RISK
};

class LpReupPredictionService {

  // ==================== SCORE ALL LPs ====================

  /**
   * Calculate re-up scores for all LPs in a fund.
   * @param {string} fundId - Fund identifier
   * @returns {Object} Scored LP list sorted by score descending, with recommendations
   */
  scoreAll({ fundId }) {
    if (!db.db) throw new Error('Database not initialized');
    if (!fundId) throw new Error('fundId is required');

    const fund = db.findById('funds', fundId);
    if (!fund) throw new Error(`Fund ${fundId} not found`);

    // Get all LPs with commitments in this fund
    const commitments = db.query(`
      SELECT c.*, i.name as investor_name, i.entity_type, i.id as inv_id
      FROM commitments c
      JOIN investors i ON c.investor_id = i.id
      WHERE c.fund_id = ? AND c.status = 'ACTIVE'
    `, [fundId]);

    if (commitments.length === 0) {
      return { fundId, fundName: fund.name, scoredAt: new Date().toISOString(), investors: [], summary: { total: 0 } };
    }

    // Fund-level performance metrics
    const investments = db.query(`
      SELECT SUM(cost_basis) as total_cost, SUM(fair_value) as total_fv
      FROM investments WHERE fund_id = ? AND status IN ('ACTIVE', 'PARTIALLY_REALIZED', 'FULLY_REALIZED')
    `, [fundId]);

    const totalCost = (investments[0] || {}).total_cost || 0;
    const totalFV = (investments[0] || {}).total_fv || 0;
    const fundMoic = totalCost > 0 ? totalFV / totalCost : 1.0;

    // Max commitment for normalization
    const maxCommitment = Math.max(...commitments.map(c => c.commitment));

    // Score each LP
    const scoredInvestors = commitments.map(c => {
      const scores = {};

      // Factor 1: Commitment Size (larger = higher, normalized 0-20)
      scores.commitmentSize = maxCommitment > 0
        ? (c.commitment / maxCommitment) * 20
        : 10;

      // Factor 2: Fund Performance (MOIC-based, weight 30%)
      if (fundMoic > 2.0) scores.fundPerformance = 30;
      else if (fundMoic > 1.5) scores.fundPerformance = 20;
      else if (fundMoic > 1.2) scores.fundPerformance = 12;
      else if (fundMoic > 1.0) scores.fundPerformance = 6;
      else scores.fundPerformance = 0;

      // Factor 3: Payment History (no late payments = +15)
      const latePayments = this._countLatePayments(fundId, c.investor_id);
      if (latePayments === 0) scores.paymentHistory = 15;
      else if (latePayments === 1) scores.paymentHistory = 10;
      else if (latePayments <= 3) scores.paymentHistory = 5;
      else scores.paymentHistory = 0;

      // Factor 4: Entity Type (institutional = higher)
      const entityScore = this._entityTypeScore(c.entity_type);
      scores.entityType = entityScore;

      // Factor 5: Multiple Commitments (invested in >1 fund = +15)
      const fundCount = this._countFundParticipation(c.investor_id);
      if (fundCount >= 3) scores.multipleCommitments = 15;
      else if (fundCount === 2) scores.multipleCommitments = 12;
      else scores.multipleCommitments = 5;

      // Factor 6: Communication Engagement (placeholder — default 5 of 10)
      scores.communicationEngagement = 5;

      // Weighted total score (0-100)
      const rawScore =
        (scores.commitmentSize / 20) * (WEIGHTS.commitmentSize * 100) +
        (scores.fundPerformance / 30) * (WEIGHTS.fundPerformance * 100) +
        (scores.paymentHistory / 15) * (WEIGHTS.paymentHistory * 100) +
        (scores.entityType / 10) * (WEIGHTS.entityType * 100) +
        (scores.multipleCommitments / 15) * (WEIGHTS.multipleCommitments * 100) +
        (scores.communicationEngagement / 10) * (WEIGHTS.communicationEngagement * 100);

      const totalScore = Math.min(100, Math.max(0, parseFloat(rawScore.toFixed(1))));

      let recommendation;
      if (totalScore >= THRESHOLDS.HIGH_PRIORITY) recommendation = 'HIGH_PRIORITY';
      else if (totalScore >= THRESHOLDS.MEDIUM_PRIORITY) recommendation = 'MEDIUM_PRIORITY';
      else if (totalScore >= THRESHOLDS.LOW_PRIORITY) recommendation = 'LOW_PRIORITY';
      else recommendation = 'AT_RISK';

      return {
        investorId: c.investor_id,
        investorName: c.investor_name,
        entityType: c.entity_type,
        commitment: c.commitment,
        calledCapital: c.called_capital,
        score: totalScore,
        recommendation,
        factors: {
          commitmentSize: { score: parseFloat(scores.commitmentSize.toFixed(1)), maxScore: 20, weight: WEIGHTS.commitmentSize },
          fundPerformance: { score: parseFloat(scores.fundPerformance.toFixed(1)), maxScore: 30, weight: WEIGHTS.fundPerformance, fundMoic: parseFloat(fundMoic.toFixed(4)) },
          paymentHistory: { score: parseFloat(scores.paymentHistory.toFixed(1)), maxScore: 15, weight: WEIGHTS.paymentHistory, latePayments },
          entityType: { score: parseFloat(scores.entityType.toFixed(1)), maxScore: 10, weight: WEIGHTS.entityType },
          multipleCommitments: { score: parseFloat(scores.multipleCommitments.toFixed(1)), maxScore: 15, weight: WEIGHTS.multipleCommitments, fundCount },
          communicationEngagement: { score: parseFloat(scores.communicationEngagement.toFixed(1)), maxScore: 10, weight: WEIGHTS.communicationEngagement, note: 'Placeholder — integrate CRM data' }
        }
      };
    });

    // Sort by score descending
    scoredInvestors.sort((a, b) => b.score - a.score);

    const summary = {
      total: scoredInvestors.length,
      highPriority: scoredInvestors.filter(s => s.recommendation === 'HIGH_PRIORITY').length,
      mediumPriority: scoredInvestors.filter(s => s.recommendation === 'MEDIUM_PRIORITY').length,
      lowPriority: scoredInvestors.filter(s => s.recommendation === 'LOW_PRIORITY').length,
      atRisk: scoredInvestors.filter(s => s.recommendation === 'AT_RISK').length,
      averageScore: parseFloat((scoredInvestors.reduce((sum, s) => sum + s.score, 0) / scoredInvestors.length).toFixed(1)),
      fundMoic: parseFloat(fundMoic.toFixed(4))
    };

    return {
      fundId,
      fundName: fund.name,
      scoredAt: new Date().toISOString(),
      investors: scoredInvestors,
      summary
    };
  }

  // ==================== RECOMMENDATIONS ====================

  /**
   * Return actionable recommendations only (no raw scores).
   * @param {string} fundId - Fund identifier
   * @returns {Object} Grouped recommendations with suggested actions
   */
  getRecommendations({ fundId }) {
    const scored = this.scoreAll({ fundId });

    const recommendations = {
      fundId: scored.fundId,
      fundName: scored.fundName,
      generatedAt: scored.scoredAt,
      highPriority: {
        description: 'Strong re-up candidates — prioritize relationship engagement',
        action: 'Schedule meetings, share fund updates, begin soft-circle for next vehicle',
        investors: scored.investors
          .filter(s => s.recommendation === 'HIGH_PRIORITY')
          .map(s => ({
            investorId: s.investorId,
            investorName: s.investorName,
            entityType: s.entityType,
            commitment: s.commitment,
            score: s.score,
            keyStrengths: this._identifyStrengths(s.factors)
          }))
      },
      mediumPriority: {
        description: 'Likely re-up with additional engagement — nurture relationship',
        action: 'Increase communication frequency, address any concerns, offer co-invest opportunities',
        investors: scored.investors
          .filter(s => s.recommendation === 'MEDIUM_PRIORITY')
          .map(s => ({
            investorId: s.investorId,
            investorName: s.investorName,
            entityType: s.entityType,
            commitment: s.commitment,
            score: s.score,
            improvementAreas: this._identifyWeaknesses(s.factors)
          }))
      },
      lowPriority: {
        description: 'Re-up uncertain — requires targeted intervention',
        action: 'Understand concerns, consider concessions or structural changes',
        investors: scored.investors
          .filter(s => s.recommendation === 'LOW_PRIORITY')
          .map(s => ({
            investorId: s.investorId,
            investorName: s.investorName,
            entityType: s.entityType,
            commitment: s.commitment,
            score: s.score,
            risks: this._identifyWeaknesses(s.factors)
          }))
      },
      atRisk: {
        description: 'Unlikely to re-up without significant change',
        action: 'Conduct exit interview, understand root causes, consider replacement LPs',
        investors: scored.investors
          .filter(s => s.recommendation === 'AT_RISK')
          .map(s => ({
            investorId: s.investorId,
            investorName: s.investorName,
            entityType: s.entityType,
            commitment: s.commitment,
            score: s.score,
            criticalIssues: this._identifyWeaknesses(s.factors)
          }))
      },
      summary: scored.summary
    };

    return recommendations;
  }

  // ==================== PRIVATE HELPERS ====================

  _countLatePayments(fundId, investorId) {
    const activity = db.query(`
      SELECT due_date, payment_date FROM capital_activity
      WHERE fund_id = ? AND investor_id = ? AND type = 'CAPITAL_CALL' AND payment_date IS NOT NULL
    `, [fundId, investorId]);

    let lateCount = 0;
    for (const a of activity) {
      if (a.due_date && a.payment_date && new Date(a.payment_date) > new Date(a.due_date)) {
        lateCount++;
      }
    }
    return lateCount;
  }

  _countFundParticipation(investorId) {
    const funds = db.query(`
      SELECT DISTINCT fund_id FROM commitments
      WHERE investor_id = ? AND status = 'ACTIVE'
    `, [investorId]);
    return funds.length;
  }

  _entityTypeScore(entityType) {
    if (!entityType) return 3;
    // Check for partial matches
    for (const [key, score] of Object.entries(ENTITY_TYPE_SCORES)) {
      if (entityType.toLowerCase().includes(key.toLowerCase())) return score;
    }
    return 3; // Default for unknown types
  }

  _identifyStrengths(factors) {
    const strengths = [];
    if (factors.commitmentSize.score >= 15) strengths.push('Large commitment size');
    if (factors.fundPerformance.score >= 20) strengths.push('Strong fund performance');
    if (factors.paymentHistory.score >= 15) strengths.push('Perfect payment history');
    if (factors.entityType.score >= 8) strengths.push('Institutional investor profile');
    if (factors.multipleCommitments.score >= 12) strengths.push('Multi-fund relationship');
    return strengths;
  }

  _identifyWeaknesses(factors) {
    const weaknesses = [];
    if (factors.commitmentSize.score < 10) weaknesses.push('Smaller commitment relative to peers');
    if (factors.fundPerformance.score < 12) weaknesses.push('Fund performance below expectations');
    if (factors.paymentHistory.score < 10) weaknesses.push('Late payment history');
    if (factors.entityType.score < 5) weaknesses.push('Non-institutional investor type');
    if (factors.multipleCommitments.score < 10) weaknesses.push('Single-fund relationship');
    if (factors.communicationEngagement.score < 5) weaknesses.push('Low engagement');
    return weaknesses;
  }
}

module.exports = new LpReupPredictionService();
