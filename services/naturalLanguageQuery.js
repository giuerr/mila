/**
 * Natural Language Query Interface
 * Uses Anthropic SDK to answer fund questions by querying the DB intelligently.
 * POST /api/ask — "What's our largest LP's unfunded commitment?"
 */

const db = require('../db/database');

class NaturalLanguageQueryService {

  constructor() {
    this.anthropic = null;
  }

  _getClient() {
    if (!this.anthropic) {
      try {
        const Anthropic = require('@anthropic-ai/sdk');
        this.anthropic = new Anthropic();
      } catch (e) {
        throw new Error('Anthropic SDK not available. Set ANTHROPIC_API_KEY env var.');
      }
    }
    return this.anthropic;
  }

  /**
   * Answer a natural language question about fund data
   */
  async ask({ question, fundId, context }) {
    if (!question) throw new Error('question is required');

    // Step 1: Gather context from DB
    const dbContext = this._gatherContext(fundId);

    // Step 2: Ask Claude to answer using the data
    const client = this._getClient();
    const systemPrompt = `You are Mila, the CFO of Antoninus Global SPC, a Cayman Islands fund management company. Answer questions about fund data precisely and concisely. Use the provided data context. Format numbers as currency where appropriate. If you cannot answer from the data provided, say so clearly.`;

    const userPrompt = `Here is the current fund data:\n\n${JSON.stringify(dbContext, null, 2)}\n\n${context ? `Additional context: ${context}\n\n` : ''}Question: ${question}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const answer = response.content[0]?.text || 'Unable to generate answer.';

    return {
      question,
      answer,
      fundId: fundId || 'all',
      dataSnapshot: {
        fundsAnalyzed: dbContext.funds?.length || 0,
        investorsAnalyzed: dbContext.investors?.length || 0,
        investmentsAnalyzed: dbContext.investments?.length || 0
      },
      answeredAt: new Date().toISOString(),
      model: response.model,
      tokensUsed: response.usage?.output_tokens || 0
    };
  }

  /**
   * Answer without AI — structured query using keyword matching
   * Fallback when ANTHROPIC_API_KEY is not set
   */
  askLocal({ question, fundId }) {
    if (!question) throw new Error('question is required');
    if (!db.db) throw new Error('Database not initialized');

    const q = question.toLowerCase();
    let answer;

    // Pattern matching for common fund queries
    if (q.includes('largest lp') || q.includes('biggest investor') || q.includes('top investor')) {
      answer = this._queryLargestLP(fundId);
    } else if (q.includes('unfunded') || q.includes('uncalled')) {
      answer = this._queryUnfunded(fundId);
    } else if (q.includes('nav') || q.includes('net asset')) {
      answer = this._queryNav(fundId);
    } else if (q.includes('aum') || q.includes('assets under')) {
      answer = this._queryAUM();
    } else if (q.includes('how many') && (q.includes('fund') || q.includes('lp') || q.includes('investor') || q.includes('investment'))) {
      answer = this._queryCounts(q, fundId);
    } else if (q.includes('filing') || q.includes('deadline') || q.includes('compliance')) {
      answer = this._queryFilings();
    } else if (q.includes('performance') || q.includes('moic') || q.includes('irr') || q.includes('return')) {
      answer = this._queryPerformance(fundId);
    } else if (q.includes('concentration') || q.includes('exposure')) {
      answer = this._queryConcentration(fundId);
    } else if (q.includes('fee') || q.includes('management fee') || q.includes('carry')) {
      answer = this._queryFees(fundId);
    } else {
      answer = this._queryGeneral(fundId);
    }

    return {
      question,
      answer: answer.text,
      data: answer.data,
      fundId: fundId || 'all',
      method: 'local',
      answeredAt: new Date().toISOString()
    };
  }

  // --- Query Handlers ---

  _queryLargestLP(fundId) {
    const whereClause = fundId ? 'WHERE c.fund_id = ?' : '';
    const params = fundId ? [fundId] : [];
    const lps = db.query(`
      SELECT i.name, SUM(c.commitment) as total_commitment, SUM(c.called_capital) as total_called,
             SUM(c.commitment - c.called_capital) as total_unfunded, COUNT(DISTINCT c.fund_id) as fund_count
      FROM commitments c JOIN investors i ON c.investor_id = i.id ${whereClause}
      GROUP BY c.investor_id ORDER BY total_commitment DESC LIMIT 5
    `, params);

    if (lps.length === 0) return { text: 'No investors found.', data: [] };
    const top = lps[0];
    return {
      text: `The largest LP is ${top.name} with $${Number(top.total_commitment).toLocaleString()} total commitment across ${top.fund_count} fund(s). Unfunded: $${Number(top.total_unfunded).toLocaleString()}.`,
      data: lps
    };
  }

  _queryUnfunded(fundId) {
    const whereClause = fundId ? 'WHERE c.fund_id = ?' : '';
    const params = fundId ? [fundId] : [];
    const result = db.query(`
      SELECT SUM(c.commitment - c.called_capital) as total_unfunded, SUM(c.commitment) as total_commitment, SUM(c.called_capital) as total_called
      FROM commitments c ${whereClause}
    `, params);

    const data = result[0] || {};
    const pct = data.total_commitment > 0 ? ((data.total_unfunded / data.total_commitment) * 100).toFixed(1) : 0;
    return {
      text: `Total unfunded commitments: $${Number(data.total_unfunded || 0).toLocaleString()} (${pct}% of total commitments of $${Number(data.total_commitment || 0).toLocaleString()}).`,
      data
    };
  }

  _queryNav(fundId) {
    if (fundId) {
      const fund = db.findById('funds', fundId);
      return fund
        ? { text: `${fund.name} NAV: $${Number(fund.nav || 0).toLocaleString()}.`, data: fund }
        : { text: 'Fund not found.', data: null };
    }
    const funds = db.findAll('funds', { status: 'ACTIVE' });
    const totalNav = funds.reduce((sum, f) => sum + (f.nav || 0), 0);
    return {
      text: `Total NAV across ${funds.length} active fund(s): $${Number(totalNav).toLocaleString()}.`,
      data: funds.map(f => ({ name: f.name, nav: f.nav }))
    };
  }

  _queryAUM() {
    const funds = db.findAll('funds', { status: 'ACTIVE' });
    const totalAUM = funds.reduce((sum, f) => sum + (f.nav || 0), 0);
    const totalCommitments = funds.reduce((sum, f) => sum + (f.total_commitments || 0), 0);
    return {
      text: `Total AUM (by NAV): $${Number(totalAUM).toLocaleString()} across ${funds.length} active fund(s). Total commitments: $${Number(totalCommitments).toLocaleString()}.`,
      data: { totalAUM, totalCommitments, fundCount: funds.length }
    };
  }

  _queryCounts(q, fundId) {
    const counts = {};
    if (q.includes('fund')) counts.activeFunds = db.findAll('funds', { status: 'ACTIVE' }).length;
    if (q.includes('investor') || q.includes('lp')) counts.investors = db.findAll('investors').length;
    if (q.includes('investment')) {
      const where = fundId ? { fund_id: fundId, status: 'ACTIVE' } : { status: 'ACTIVE' };
      counts.activeInvestments = db.findAll('investments', where).length;
    }
    const parts = Object.entries(counts).map(([k, v]) => `${v} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
    return { text: parts.join(', ') + '.', data: counts };
  }

  _queryFilings() {
    const upcoming = db.getUpcomingFilings(30);
    if (upcoming.length === 0) return { text: 'No upcoming filings in the next 30 days.', data: [] };
    return {
      text: `${upcoming.length} filing(s) due in the next 30 days: ${upcoming.map(f => `${f.name} (${f.deadline})`).join(', ')}.`,
      data: upcoming
    };
  }

  _queryPerformance(fundId) {
    const funds = fundId ? [db.findById('funds', fundId)].filter(Boolean) : db.findAll('funds', { status: 'ACTIVE' });
    const results = funds.map(f => {
      const moic = f.called_capital > 0 ? (f.nav / f.called_capital).toFixed(2) : 'N/A';
      return { name: f.name, nav: f.nav, calledCapital: f.called_capital, moic };
    });
    return {
      text: results.map(r => `${r.name}: ${r.moic}x MOIC (NAV $${Number(r.nav || 0).toLocaleString()})`).join('; '),
      data: results
    };
  }

  _queryConcentration(fundId) {
    const result = this._queryLargestLP(fundId);
    return {
      text: `LP concentration: ${result.text}`,
      data: result.data
    };
  }

  _queryFees(fundId) {
    const funds = fundId ? [db.findById('funds', fundId)].filter(Boolean) : db.findAll('funds', { status: 'ACTIVE' });
    const feeData = funds.map(f => ({
      name: f.name,
      mgmtFeeRate: (f.mgmt_fee_rate || 0.02) * 100 + '%',
      carryRate: (f.carry_rate || 0.20) * 100 + '%',
      preferredReturn: (f.preferred_return || 0.08) * 100 + '%',
      annualMgmtFee: (f.total_commitments || 0) * (f.mgmt_fee_rate || 0.02)
    }));
    const totalFees = feeData.reduce((sum, f) => sum + f.annualMgmtFee, 0);
    return {
      text: `Total estimated annual management fees: $${Number(totalFees).toLocaleString()}. ${feeData.map(f => `${f.name}: ${f.mgmtFeeRate} mgmt / ${f.carryRate} carry`).join('; ')}.`,
      data: feeData
    };
  }

  _queryGeneral(fundId) {
    const funds = db.findAll('funds', { status: 'ACTIVE' });
    const totalNav = funds.reduce((sum, f) => sum + (f.nav || 0), 0);
    return {
      text: `Antoninus Global SPC manages ${funds.length} active fund(s) with $${Number(totalNav).toLocaleString()} total NAV. Ask about specific topics: NAV, unfunded commitments, largest LP, performance, fees, filings, AUM.`,
      data: { fundCount: funds.length, totalNav }
    };
  }

  // --- DB Context for AI ---

  _gatherContext(fundId) {
    if (!db.db) return {};

    const context = {};

    if (fundId) {
      context.fund = db.findById('funds', fundId);
      context.commitments = db.query('SELECT c.*, i.name as investor_name FROM commitments c JOIN investors i ON c.investor_id = i.id WHERE c.fund_id = ?', [fundId]);
      context.investments = db.query('SELECT * FROM investments WHERE fund_id = ?', [fundId]);
    } else {
      context.funds = db.findAll('funds', { status: 'ACTIVE' });
      context.investors = db.findAll('investors', {}, 'created_at DESC', 50);
      context.investments = db.query("SELECT * FROM investments WHERE status = 'ACTIVE' LIMIT 50");
      context.upcomingFilings = db.getUpcomingFilings(60);
    }

    return context;
  }
}

module.exports = new NaturalLanguageQueryService();
