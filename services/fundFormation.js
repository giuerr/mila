/**
 * Fund Formation Support Service
 * Legal entity structuring, banking setup, service provider selection,
 * cost modeling, operational infrastructure.
 */

class FundFormationService {

  /**
   * Generate fund structure recommendation
   */
  recommendStructure({ strategy, targetAum, lpBase, gpJurisdiction, investmentFocus }) {
    const structures = [];

    // Main fund vehicle
    const mainFund = this._selectMainVehicle(strategy, targetAum, investmentFocus);
    structures.push(mainFund);

    // Parallel funds
    if (lpBase.hasErisaInvestors) {
      structures.push({
        name: `${mainFund.name} ERISA Parallel`,
        type: 'PARALLEL_FUND',
        jurisdiction: mainFund.jurisdiction,
        purpose: 'Manage benefit plan investor percentage below 25% threshold',
        estimatedFormationCost: 75000
      });
    }

    if (lpBase.hasForeignInvestors && mainFund.jurisdiction === 'Delaware') {
      structures.push({
        name: `${mainFund.name} Offshore`,
        type: 'OFFSHORE_FUND',
        jurisdiction: 'Cayman Islands',
        vehicleType: 'Exempted Limited Partnership',
        purpose: 'Tax-efficient vehicle for non-US investors',
        estimatedFormationCost: 100000
      });
    }

    // Blocker entities
    if (lpBase.hasTaxExemptInvestors || lpBase.hasForeignInvestors) {
      const blockerCount = this._estimateBlockersNeeded(investmentFocus);
      structures.push({
        name: 'Blocker Entities',
        type: 'BLOCKER',
        count: blockerCount,
        jurisdiction: 'Delaware',
        vehicleType: 'C-Corporation',
        purpose: 'Shield tax-exempt and foreign LPs from ECI/UBTI',
        estimatedFormationCost: 15000 * blockerCount
      });
    }

    // GP entities
    structures.push(
      {
        name: `${mainFund.name} GP LLC`,
        type: 'GENERAL_PARTNER',
        jurisdiction: gpJurisdiction || 'Delaware',
        vehicleType: 'LLC',
        purpose: 'General partner — receives carried interest',
        estimatedFormationCost: 5000
      },
      {
        name: `${mainFund.name} Management LLC`,
        type: 'MANAGEMENT_COMPANY',
        jurisdiction: gpJurisdiction || 'Delaware',
        vehicleType: 'LLC',
        purpose: 'Management company — receives management fees, employs staff',
        estimatedFormationCost: 5000
      }
    );

    // Co-invest vehicle template
    if (lpBase.coInvestDemand) {
      structures.push({
        name: `${mainFund.name} Co-Invest SPV (Template)`,
        type: 'CO_INVEST',
        jurisdiction: 'Delaware',
        vehicleType: 'LLC',
        purpose: 'Per-deal co-investment vehicle for qualifying LPs',
        estimatedFormationCost: 10000,
        note: 'Template — new SPV formed per co-invest deal'
      });
    }

    const totalCost = structures.reduce((sum, s) => sum + (s.estimatedFormationCost || 0), 0);

    return {
      recommendedStructure: structures,
      totalEstimatedFormationCost: totalCost,
      entityCount: structures.length,
      diagram: this._generateStructureDiagram(structures),
      jurisdictions: [...new Set(structures.map(s => s.jurisdiction))],
      keyConsiderations: this._getKeyConsiderations(strategy, lpBase)
    };
  }

  /**
   * Banking setup recommendations
   */
  recommendBankingSetup({ fundStructure, expectedAum, currencies }) {
    const accounts = [];

    for (const entity of fundStructure) {
      if (entity.type === 'BLOCKER') continue; // Blockers use fund's bank

      accounts.push({
        entity: entity.name,
        entityType: entity.type,
        accounts: [
          {
            type: 'Operating Account',
            purpose: 'Day-to-day fund operations',
            currency: 'USD',
            minimumBalance: entity.type === 'MANAGEMENT_COMPANY' ? 250000 : 100000
          },
          ...(entity.type === 'PARALLEL_FUND' || entity.type === 'OFFSHORE_FUND' || entity.type.includes('FUND') ? [
            {
              type: 'Capital Call Account',
              purpose: 'Receive LP capital contributions',
              currency: 'USD'
            },
            {
              type: 'Distribution Account',
              purpose: 'Outbound distributions to LPs',
              currency: 'USD'
            }
          ] : [])
        ]
      });
    }

    // Multi-currency accounts
    const additionalCurrencyAccounts = currencies
      .filter(c => c !== 'USD')
      .map(c => ({
        type: 'Foreign Currency Account',
        currency: c,
        purpose: `Handle ${c}-denominated transactions and investments`
      }));

    const recommendedBanks = [
      { name: 'JPMorgan Chase', strengths: 'Largest PE banking platform, extensive global reach', tier: 1 },
      { name: 'Bank of New York Mellon', strengths: 'Premier custody and fund services', tier: 1 },
      { name: 'Citibank', strengths: 'Strong in multi-currency, global presence', tier: 1 },
      { name: 'Silicon Valley Bank (FCNB)', strengths: 'VC/growth equity specialization', tier: 2 },
      { name: 'First Republic (JPM)', strengths: 'HNW/family office relationships', tier: 2 }
    ];

    return {
      requiredAccounts: accounts,
      additionalCurrencyAccounts,
      totalAccounts: accounts.reduce((sum, a) => sum + a.accounts.length, 0) + additionalCurrencyAccounts.length,
      recommendedBanks: expectedAum > 500000000 ? recommendedBanks.filter(b => b.tier === 1) : recommendedBanks,
      recommendation: 'Maintain relationships with at least 2-3 banking partners for counterparty diversification',
      estimatedBankingCosts: {
        monthlyMaintenance: accounts.reduce((sum, a) => sum + a.accounts.length * 50, 0),
        wireFeesEstimate: '15-35 per wire (domestic), 35-65 per wire (international)',
        fxSpread: '10-50 bps depending on volume and negotiation'
      }
    };
  }

  /**
   * Service provider RFP comparison
   */
  compareServiceProviders(category, candidates) {
    const scored = candidates.map(c => {
      let totalScore = 0;
      const criteria = this._getScoringCriteria(category);
      const scores = {};

      for (const criterion of criteria) {
        const score = c.scores?.[criterion.name] || 5;
        const weighted = score * criterion.weight;
        scores[criterion.name] = { raw: score, weighted: parseFloat(weighted.toFixed(2)) };
        totalScore += weighted;
      }

      return {
        name: c.name,
        category,
        annualFee: c.annualFee,
        setupFee: c.setupFee || 0,
        scores,
        totalScore: parseFloat(totalScore.toFixed(2)),
        strengths: c.strengths,
        weaknesses: c.weaknesses,
        references: c.references
      };
    });

    scored.sort((a, b) => b.totalScore - a.totalScore);

    return {
      category,
      candidates: scored,
      recommendation: scored[0]?.name,
      comparisonMatrix: scored.map(c => ({
        name: c.name,
        totalScore: c.totalScore,
        annualFee: c.annualFee,
        valueScore: parseFloat((c.totalScore / (c.annualFee / 10000)).toFixed(2)) // Score per $10K
      }))
    };
  }

  /**
   * Fund formation budget and timeline
   */
  generateFormationBudget({ strategy, entityCount, complexity = 'standard' }) {
    const multiplier = complexity === 'complex' ? 1.5 : complexity === 'simple' ? 0.7 : 1;

    const lineItems = [
      { category: 'Legal — Fund Documentation', estimate: 250000 * multiplier, range: `${200000 * multiplier}-${400000 * multiplier}` },
      { category: 'Legal — Regulatory (SEC/CIMA)', estimate: 50000 * multiplier, range: `${30000 * multiplier}-${75000 * multiplier}` },
      { category: 'Tax Structuring', estimate: 75000 * multiplier, range: `${50000 * multiplier}-${100000 * multiplier}` },
      { category: 'Placement Agent (if used)', estimate: 0, range: '1-2% of capital raised', note: 'Trailing fees on committed capital' },
      { category: 'Entity Formation (all entities)', estimate: entityCount * 10000, range: `${entityCount * 5000}-${entityCount * 15000}` },
      { category: 'D&O / E&O Insurance (Year 1)', estimate: 80000, range: '50000-150000' },
      { category: 'Technology Setup', estimate: 50000, range: '25000-100000' },
      { category: 'Branding & Marketing Materials', estimate: 30000, range: '15000-75000' },
      { category: 'Travel / Roadshow', estimate: 50000, range: '25000-100000' },
      { category: 'Miscellaneous', estimate: 25000, range: '10000-50000' }
    ];

    const totalEstimate = lineItems.reduce((sum, li) => sum + li.estimate, 0);

    const timeline = [
      { phase: 'Structure & Documentation', duration: '8-12 weeks', description: 'Legal entity formation, LPA drafting, regulatory filings' },
      { phase: 'Operational Setup', duration: '4-6 weeks', description: 'Banking, administrator onboarding, technology, insurance' },
      { phase: 'Marketing & Roadshow', duration: '12-24 weeks', description: 'DDQ, PPM, investor meetings, soft circles' },
      { phase: 'First Close', duration: '2-4 weeks', description: 'Subscription processing, KYC/AML, fund activation' }
    ];

    return {
      strategy,
      complexity,
      budget: {
        lineItems,
        totalEstimate,
        note: 'Organizational expenses subject to LPA cap — amounts exceeding cap borne by GP'
      },
      timeline,
      totalTimelineWeeks: '26-46 weeks from kickoff to first close'
    };
  }

  // --- Private ---

  /**
   * Get all available fund vehicles across 26 jurisdictions
   */
  getAvailableVehicles(jurisdiction) {
    const vehicles = {

      // --- Americas ---
      US: {
        jurisdiction: 'Delaware (US)', regulator: 'SEC / State',
        vehicles: [
          { type: 'Limited Partnership', taxTransparent: true, formationCost: 15000, timeWeeks: '2-3', registeredAgent: 'Corporation Service Company / CT Corporation', notes: 'Standard PE/VC vehicle' },
          { type: 'LLC', taxTransparent: true, formationCost: 10000, timeWeeks: '1-2', registeredAgent: 'Corporation Service Company', notes: 'GP entity / management company / co-invest SPV' },
          { type: 'C-Corporation', taxTransparent: false, formationCost: 10000, timeWeeks: '1-2', registeredAgent: 'Corporation Service Company', notes: 'Blocker entity for tax-exempt/foreign investors' }
        ]
      },
      CAYMAN: {
        jurisdiction: 'Cayman Islands', regulator: 'CIMA',
        vehicles: [
          { type: 'Exempted Limited Partnership', taxTransparent: true, formationCost: 25000, timeWeeks: '3-4', registeredAgent: 'Maples & Calder / Walkers / Carey Olsen', notes: 'Standard offshore PE vehicle' },
          { type: 'Segregated Portfolio Company (SPC)', taxTransparent: false, formationCost: 30000, timeWeeks: '4-6', registeredAgent: 'Maples & Calder', notes: 'Multi-strategy with ring-fenced portfolios' },
          { type: 'Exempted Company', taxTransparent: false, formationCost: 20000, timeWeeks: '2-3', registeredAgent: 'Walkers / Harneys', notes: 'Feeder fund or standalone vehicle' }
        ]
      },
      BVI: {
        jurisdiction: 'British Virgin Islands', regulator: 'BVI FSC',
        vehicles: [
          { type: 'Limited Partnership', taxTransparent: true, formationCost: 15000, timeWeeks: '2-3', registeredAgent: 'Harneys / Conyers / Carey Olsen', notes: 'Tax-transparent LP' },
          { type: 'BVI Business Company', taxTransparent: false, formationCost: 10000, timeWeeks: '1-2', registeredAgent: 'Harneys / Conyers', notes: 'Approved/private/registered fund' },
          { type: 'Segregated Portfolio Company', taxTransparent: false, formationCost: 20000, timeWeeks: '3-4', registeredAgent: 'Harneys', notes: 'Multi-class with ring-fencing' }
        ]
      },
      GUERNSEY: {
        jurisdiction: 'Guernsey', regulator: 'GFSC',
        vehicles: [
          { type: 'Limited Partnership', taxTransparent: true, formationCost: 20000, timeWeeks: '4-6', registeredAgent: 'Carey Olsen / Mourant / Ogier', notes: 'Registered/authorised fund LP' },
          { type: 'Protected Cell Company (PCC)', taxTransparent: false, formationCost: 25000, timeWeeks: '4-6', registeredAgent: 'Mourant / Ogier', notes: 'Multi-cell structure' },
          { type: 'Incorporated Cell Company', taxTransparent: false, formationCost: 25000, timeWeeks: '4-6', registeredAgent: 'Carey Olsen', notes: 'Cells are separate legal entities' }
        ]
      },
      JERSEY: {
        jurisdiction: 'Jersey', regulator: 'JFSC',
        vehicles: [
          { type: 'Limited Partnership', taxTransparent: true, formationCost: 20000, timeWeeks: '3-5', registeredAgent: 'Carey Olsen / Mourant / Ogier', notes: 'Standard PE vehicle' },
          { type: 'Jersey Private Fund (JPF)', taxTransparent: false, formationCost: 15000, timeWeeks: '2-3', registeredAgent: 'Mourant / Ogier', notes: 'Max 50 investors, 48hr approval' },
          { type: 'Expert Fund', taxTransparent: false, formationCost: 20000, timeWeeks: '3-5', registeredAgent: 'Carey Olsen', notes: 'Min £100K investment, expert investors only' }
        ]
      },

      // --- Middle East ---
      ADGM: {
        jurisdiction: 'Abu Dhabi Global Market', regulator: 'FSRA',
        vehicles: [
          { type: 'Limited Partnership', taxTransparent: true, formationCost: 18000, timeWeeks: '4-6', registeredAgent: 'Al Tamimi / Hadef & Partners / Clifford Chance', notes: 'Common law LP' },
          { type: 'Investment Company (IC)', taxTransparent: false, formationCost: 22000, timeWeeks: '6-8', registeredAgent: 'Al Tamimi / Allen & Overy', notes: 'Exempt or qualified investor fund' },
          { type: 'Protected Cell Company', taxTransparent: false, formationCost: 25000, timeWeeks: '6-8', registeredAgent: 'Clifford Chance', notes: 'Umbrella structure' }
        ]
      },
      DIFC: {
        jurisdiction: 'Dubai International Financial Centre', regulator: 'DFSA',
        vehicles: [
          { type: 'Limited Partnership', taxTransparent: true, formationCost: 20000, timeWeeks: '4-6', registeredAgent: 'Al Tamimi / Hadef & Partners / Linklaters', notes: 'Common law LP' },
          { type: 'Investment Company', taxTransparent: false, formationCost: 25000, timeWeeks: '6-8', registeredAgent: 'Linklaters / Clifford Chance', notes: 'Domestic or external fund' },
          { type: 'Investment Trust', taxTransparent: true, formationCost: 20000, timeWeeks: '6-8', registeredAgent: 'Al Tamimi', notes: 'Trust-based vehicle' }
        ]
      },

      // --- Asia-Pacific ---
      HONG_KONG: {
        jurisdiction: 'Hong Kong', regulator: 'SFC',
        vehicles: [
          { type: 'Limited Partnership Fund (LPF)', taxTransparent: true, formationCost: 20000, timeWeeks: '4-6', registeredAgent: 'Mayer Brown / Linklaters / Davis Polk', notes: 'LPF Ordinance 2020 — PE/VC standard' },
          { type: 'Open-ended Fund Company (OFC)', taxTransparent: false, formationCost: 25000, timeWeeks: '6-8', registeredAgent: 'Linklaters / Clifford Chance', notes: 'Corporate fund vehicle, re-domiciliation allowed' }
        ]
      },
      SINGAPORE: {
        jurisdiction: 'Singapore', regulator: 'MAS',
        vehicles: [
          { type: 'Variable Capital Company (VCC)', taxTransparent: false, formationCost: 22000, timeWeeks: '4-6', registeredAgent: 'Rajah & Tann / WongPartnership / Allen & Gledhill', notes: 'Umbrella with sub-funds, S13O/S13U eligible' },
          { type: 'Limited Partnership', taxTransparent: true, formationCost: 15000, timeWeeks: '2-4', registeredAgent: 'WongPartnership / Rajah & Tann', notes: 'Tax-transparent LP' },
          { type: 'Private Company (Pte. Ltd.)', taxTransparent: false, formationCost: 10000, timeWeeks: '1-2', registeredAgent: 'Allen & Gledhill', notes: 'GP entity / single-fund vehicle' }
        ]
      },

      // --- UK ---
      UK: {
        jurisdiction: 'United Kingdom', regulator: 'FCA',
        vehicles: [
          { type: 'English Limited Partnership (ELP)', taxTransparent: true, formationCost: 15000, timeWeeks: '2-4', registeredAgent: 'Macfarlanes / Travers Smith / Clifford Chance', notes: 'Standard UK PE vehicle' },
          { type: 'Scottish Limited Partnership (SLP)', taxTransparent: true, formationCost: 15000, timeWeeks: '2-4', registeredAgent: 'Macfarlanes / Dickson Minto', notes: 'Separate legal personality (unlike ELP)' },
          { type: 'Qualifying Asset Holding Company (QAHC)', taxTransparent: false, formationCost: 20000, timeWeeks: '4-6', registeredAgent: 'Macfarlanes / Travers Smith', notes: 'Tax-efficient holding company (2022+)' }
        ]
      },

      // --- EU Member States ---
      LUXEMBOURG: {
        jurisdiction: 'Luxembourg', regulator: 'CSSF',
        vehicles: [
          { type: 'SCSp (Société en Commandite Spéciale)', taxTransparent: true, formationCost: 25000, timeWeeks: '4-6', registeredAgent: 'Arendt & Medernach / Elvinger Hoss / Loyens & Loeff', notes: 'Tax-transparent LP — most popular for PE' },
          { type: 'RAIF (Reserved Alternative Investment Fund)', taxTransparent: false, formationCost: 35000, timeWeeks: '4-6', registeredAgent: 'Arendt & Medernach / Elvinger Hoss', notes: 'No CSSF product approval — AIFM supervised' },
          { type: 'SIF (Specialised Investment Fund)', taxTransparent: false, formationCost: 40000, timeWeeks: '8-12', registeredAgent: 'Elvinger Hoss / Loyens & Loeff', notes: 'CSSF approval required, 0.01% subscription tax' },
          { type: 'SICAR', taxTransparent: false, formationCost: 35000, timeWeeks: '8-12', registeredAgent: 'Arendt & Medernach', notes: 'Venture capital vehicle — exempt on qualifying income' }
        ]
      },
      IRELAND: {
        jurisdiction: 'Ireland', regulator: 'CBI',
        vehicles: [
          { type: 'ILP (Investment Limited Partnership)', taxTransparent: true, formationCost: 30000, timeWeeks: '6-8', registeredAgent: 'A&L Goodbody / Matheson / Arthur Cox', notes: 'Reformed 2021 — modernised tax-transparent LP' },
          { type: 'ICAV (Irish Collective Asset-management Vehicle)', taxTransparent: false, formationCost: 35000, timeWeeks: '8-12', registeredAgent: 'Matheson / A&L Goodbody', notes: 'Corporate vehicle, no AGM required, UCITS or QIAIF' },
          { type: 'QIAIF (Unit Trust)', taxTransparent: false, formationCost: 30000, timeWeeks: '6-10', registeredAgent: 'Arthur Cox / Matheson', notes: 'Qualifying investor AIF — exempt from Irish tax' }
        ]
      },
      FRANCE: {
        jurisdiction: 'France', regulator: 'AMF',
        vehicles: [
          { type: 'SLP (Société de Libre Partenariat)', taxTransparent: true, formationCost: 25000, timeWeeks: '4-6', registeredAgent: 'Gide / Darrois / Bredin Prat', notes: 'French LP (2015) — tax-transparent, AMF declaration only' },
          { type: 'FPCI (Fonds Professionnel de Capital Investissement)', taxTransparent: true, formationCost: 30000, timeWeeks: '6-8', registeredAgent: 'Gide / Darrois', notes: 'Professional PE fund — AMF approved' },
          { type: 'SCA (Société en Commandite par Actions)', taxTransparent: false, formationCost: 20000, timeWeeks: '4-6', registeredAgent: 'Bredin Prat', notes: 'Partnership limited by shares' }
        ]
      },
      GERMANY: {
        jurisdiction: 'Germany', regulator: 'BaFin',
        vehicles: [
          { type: 'GmbH & Co. KG (InvKG)', taxTransparent: true, formationCost: 25000, timeWeeks: '4-6', registeredAgent: 'Hengeler Mueller / SZA / P+P Pöllath', notes: 'Investment KG — tax-transparent PE LP' },
          { type: 'Spezial-AIF (closed-ended)', taxTransparent: false, formationCost: 35000, timeWeeks: '6-10', registeredAgent: 'P+P Pöllath / Hengeler Mueller', notes: 'Institutional only — semi-transparent taxation' },
          { type: 'GmbH', taxTransparent: false, formationCost: 10000, timeWeeks: '2-3', registeredAgent: 'SZA / P+P Pöllath', notes: 'GP entity / management company' }
        ]
      },
      NETHERLANDS: {
        jurisdiction: 'Netherlands', regulator: 'AFM / DNB',
        vehicles: [
          { type: 'CV (Commanditaire Vennootschap)', taxTransparent: true, formationCost: 20000, timeWeeks: '3-5', registeredAgent: 'NautaDutilh / Loyens & Loeff / De Brauw', notes: 'Closed CV — tax-transparent LP' },
          { type: 'FGR (Fonds voor Gemene Rekening)', taxTransparent: true, formationCost: 20000, timeWeeks: '3-5', registeredAgent: 'Loyens & Loeff / NautaDutilh', notes: 'Contractual fund — tax-transparent' },
          { type: 'BV (Besloten Vennootschap)', taxTransparent: false, formationCost: 10000, timeWeeks: '1-2', registeredAgent: 'De Brauw', notes: 'GP entity / holding / blocker' }
        ]
      },
      ITALY: {
        jurisdiction: 'Italy', regulator: 'CONSOB / Banca d\'Italia',
        vehicles: [
          { type: 'FIA (Fondo di Investimento Alternativo)', taxTransparent: false, formationCost: 40000, timeWeeks: '8-12', registeredAgent: 'BonelliErede / Gianni & Origoni / Chiomenti', notes: 'Italian AIF — exempt at fund level, taxed on distribution' },
          { type: 'SRL (Società a Responsabilità Limitata)', taxTransparent: false, formationCost: 10000, timeWeeks: '2-3', registeredAgent: 'BonelliErede', notes: 'GP entity / management company' }
        ]
      },
      SPAIN: {
        jurisdiction: 'Spain', regulator: 'CNMV',
        vehicles: [
          { type: 'FCR (Fondo de Capital Riesgo)', taxTransparent: true, formationCost: 30000, timeWeeks: '6-10', registeredAgent: 'Uría Menéndez / Garrigues / Cuatrecasas', notes: 'Tax-transparent PE fund' },
          { type: 'SCR (Sociedad de Capital Riesgo)', taxTransparent: false, formationCost: 35000, timeWeeks: '8-12', registeredAgent: 'Uría Menéndez / Garrigues', notes: 'Corporate PE vehicle — 1% effective CIT on qualifying gains' },
          { type: 'SL (Sociedad Limitada)', taxTransparent: false, formationCost: 8000, timeWeeks: '2-3', registeredAgent: 'Cuatrecasas', notes: 'GP entity / management company' }
        ]
      },

      // --- Nordics ---
      DENMARK: {
        jurisdiction: 'Denmark', regulator: 'DFSA (Finanstilsynet)',
        vehicles: [
          { type: 'K/S (Kommanditselskab)', taxTransparent: true, formationCost: 18000, timeWeeks: '3-5', registeredAgent: 'Gorrissen Federspiel / Kromann Reumert / Bech-Bruun', notes: 'Tax-transparent LP — standard Danish PE vehicle' },
          { type: 'ApS (Anpartsselskab)', taxTransparent: false, formationCost: 8000, timeWeeks: '1-2', registeredAgent: 'Gorrissen Federspiel', notes: 'GP entity / management company' }
        ]
      },
      SWEDEN: {
        jurisdiction: 'Sweden', regulator: 'FI (Finansinspektionen)',
        vehicles: [
          { type: 'KB (Kommanditbolag)', taxTransparent: true, formationCost: 15000, timeWeeks: '2-4', registeredAgent: 'Mannheimer Swartling / Vinge / Setterwalls', notes: 'Tax-transparent LP' },
          { type: 'AB (Aktiebolag)', taxTransparent: false, formationCost: 10000, timeWeeks: '1-2', registeredAgent: 'Mannheimer Swartling / Vinge', notes: 'GP entity / management company' }
        ]
      },
      NORWAY: {
        jurisdiction: 'Norway', regulator: 'Finanstilsynet',
        vehicles: [
          { type: 'KS (Kommandittselskap)', taxTransparent: true, formationCost: 18000, timeWeeks: '3-5', registeredAgent: 'Wikborg Rein / Thommessen / BAHR', notes: 'Tax-transparent LP — standard Norwegian PE vehicle' },
          { type: 'AS (Aksjeselskap)', taxTransparent: false, formationCost: 10000, timeWeeks: '1-2', registeredAgent: 'Wikborg Rein / Thommessen', notes: 'GP entity / management company' }
        ]
      },
      FINLAND: {
        jurisdiction: 'Finland', regulator: 'FIN-FSA',
        vehicles: [
          { type: 'Ky (Kommandiittiyhtiö)', taxTransparent: true, formationCost: 15000, timeWeeks: '2-4', registeredAgent: 'Hannes Snellman / Castrén & Snellman / Roschier', notes: 'Tax-transparent LP' },
          { type: 'Oy (Osakeyhtiö)', taxTransparent: false, formationCost: 8000, timeWeeks: '1-2', registeredAgent: 'Hannes Snellman / Roschier', notes: 'GP entity / management company' }
        ]
      },

      // --- Baltics ---
      ESTONIA: {
        jurisdiction: 'Estonia', regulator: 'EFSA (Finantsinspektsioon)',
        vehicles: [
          { type: 'UÜ (Usaldusühing)', taxTransparent: true, formationCost: 10000, timeWeeks: '2-3', registeredAgent: 'Ellex / Sorainen / TGS Baltic', notes: 'Tax-transparent LP' },
          { type: 'OÜ (Osaühing)', taxTransparent: false, formationCost: 5000, timeWeeks: '1-2', registeredAgent: 'Ellex / Sorainen', notes: 'GP entity — 0% CIT on undistributed profits' }
        ]
      },
      LITHUANIA: {
        jurisdiction: 'Lithuania', regulator: 'LB (Lietuvos Bankas)',
        vehicles: [
          { type: 'KŪB (Komanditinė ūkinė bendrija)', taxTransparent: true, formationCost: 10000, timeWeeks: '2-3', registeredAgent: 'Ellex / Sorainen / Cobalt', notes: 'Tax-transparent LP' },
          { type: 'UAB (Uždaroji akcinė bendrovė)', taxTransparent: false, formationCost: 5000, timeWeeks: '1-2', registeredAgent: 'Sorainen / Cobalt', notes: 'GP entity / management company' }
        ]
      },

      // --- Switzerland ---
      SWITZERLAND: {
        jurisdiction: 'Switzerland', regulator: 'FINMA',
        vehicles: [
          { type: 'KmGK (Kommanditgesellschaft für kollektive Kapitalanlagen)', taxTransparent: true, formationCost: 35000, timeWeeks: '8-12', registeredAgent: 'Lenz & Staehelin / Bär & Karrer / Homburger', notes: 'Swiss LP for collective investments — FINMA licensed' },
          { type: 'L-QIF (Limited Qualified Investor Fund)', taxTransparent: false, formationCost: 25000, timeWeeks: '4-6', registeredAgent: 'Lenz & Staehelin / Bär & Karrer', notes: 'No FINMA product approval — 2024 regime' },
          { type: 'SICAV', taxTransparent: false, formationCost: 40000, timeWeeks: '8-12', registeredAgent: 'Homburger / Lenz & Staehelin', notes: 'Open-ended corporate vehicle' },
          { type: 'GmbH (Gesellschaft mit beschränkter Haftung)', taxTransparent: false, formationCost: 10000, timeWeeks: '2-3', registeredAgent: 'Bär & Karrer', notes: 'GP entity / management company' }
        ]
      },

      // --- Japan & Korea ---
      JAPAN: {
        jurisdiction: 'Japan', regulator: 'FSA/JFSA',
        vehicles: [
          { type: 'Investment LPS (Tōshi jigyō yūgen sekinin kumiai)', taxTransparent: true, formationCost: 25000, timeWeeks: '4-8', registeredAgent: 'Nishimura & Asahi / Anderson Mōri & Tomotsune / Mori Hamada & Matsumoto', notes: 'Tax-transparent LP — standard domestic PE/VC vehicle under LPS Act 1998' },
          { type: 'GK-TK Structure (Gōdō kaisha + Tokumei kumiai)', taxTransparent: true, formationCost: 20000, timeWeeks: '4-6', registeredAgent: 'Anderson Mōri & Tomotsune / TMI Associates', notes: 'Standard for foreign-managed Japan funds; GK as operator, TK as silent investor' },
          { type: 'Kabushiki kaisha (KK)', taxTransparent: false, formationCost: 15000, timeWeeks: '2-4', registeredAgent: 'Nishimura & Asahi / Mori Hamada & Matsumoto', notes: 'GP entity / management company / corporate fund vehicle' },
          { type: 'Gōdō kaisha (GK)', taxTransparent: false, formationCost: 10000, timeWeeks: '1-2', registeredAgent: 'TMI Associates', notes: 'GP entity / fund operator in GK-TK structure' }
        ]
      },
      KOREA: {
        jurisdiction: 'South Korea', regulator: 'FSC / FSS',
        vehicles: [
          { type: 'PEF (Gyeongnyeong chamyeo-hyeong samopeundeu)', taxTransparent: true, formationCost: 25000, timeWeeks: '6-10', registeredAgent: 'Kim & Chang / Bae Kim & Lee / Yulchon', notes: 'Private equity fund — LP-style under FSCMA; standard PE vehicle' },
          { type: 'Venture Investment Partnership', taxTransparent: true, formationCost: 18000, timeWeeks: '4-6', registeredAgent: 'Kim & Chang / Shin & Kim', notes: 'VC-focused vehicle under Venture Investment Promotion Act' },
          { type: 'Jusik hoesa (JH)', taxTransparent: false, formationCost: 12000, timeWeeks: '2-4', registeredAgent: 'Bae Kim & Lee / Yulchon', notes: 'Stock company — GP entity / management company' },
          { type: 'Yuhan hoesa (YH)', taxTransparent: false, formationCost: 8000, timeWeeks: '1-2', registeredAgent: 'Kim & Chang', notes: 'Korean LLC — GP entity / SPV / co-invest vehicle' }
        ]
      }
    };

    return vehicles[jurisdiction] || null;
  }

  /**
   * Get all available vehicles across all jurisdictions
   */
  getAllAvailableVehicles() {
    const jurisdictions = [
      'US', 'CAYMAN', 'BVI', 'GUERNSEY', 'JERSEY', 'ADGM', 'DIFC',
      'HONG_KONG', 'SINGAPORE', 'UK', 'LUXEMBOURG', 'IRELAND', 'FRANCE',
      'GERMANY', 'NETHERLANDS', 'ITALY', 'SPAIN', 'DENMARK', 'SWEDEN',
      'NORWAY', 'FINLAND', 'ESTONIA', 'LITHUANIA', 'SWITZERLAND',
      'JAPAN', 'KOREA'
    ];
    const all = {};
    for (const j of jurisdictions) {
      all[j] = this.getAvailableVehicles(j);
    }
    return all;
  }

  _selectMainVehicle(strategy, targetAum, investmentFocus) {
    const region = investmentFocus?.region;
    const jurisdiction = investmentFocus?.jurisdiction;

    // If a specific jurisdiction is requested, use its primary LP vehicle
    if (jurisdiction) {
      const vehicles = this.getAvailableVehicles(jurisdiction);
      if (vehicles) {
        const lp = vehicles.vehicles.find(v => v.taxTransparent) || vehicles.vehicles[0];
        return {
          name: 'Antoninus Fund',
          type: 'MAIN_FUND',
          jurisdiction: vehicles.jurisdiction,
          vehicleType: lp.type,
          registeredAgent: lp.registeredAgent,
          estimatedFormationCost: lp.formationCost
        };
      }
    }

    // Region-based defaults
    if (region === 'US' || strategy === 'buyout' || strategy === 'growth_equity') {
      return {
        name: 'Antoninus Fund', type: 'MAIN_FUND',
        jurisdiction: 'Delaware', vehicleType: 'Limited Partnership',
        registeredAgent: 'Corporation Service Company', estimatedFormationCost: 15000
      };
    }
    if (region === 'EU' || region === 'Europe') {
      return {
        name: 'Antoninus Fund', type: 'MAIN_FUND',
        jurisdiction: 'Luxembourg', vehicleType: 'SCSp (Société en Commandite Spéciale)',
        registeredAgent: 'Arendt & Medernach / Elvinger Hoss', estimatedFormationCost: 25000
      };
    }
    if (region === 'Asia' || region === 'APAC') {
      return {
        name: 'Antoninus Fund', type: 'MAIN_FUND',
        jurisdiction: 'Singapore', vehicleType: 'Variable Capital Company (VCC)',
        registeredAgent: 'Rajah & Tann / WongPartnership', estimatedFormationCost: 22000
      };
    }
    if (region === 'Middle East' || region === 'GCC') {
      return {
        name: 'Antoninus Fund', type: 'MAIN_FUND',
        jurisdiction: 'ADGM', vehicleType: 'Limited Partnership',
        registeredAgent: 'Al Tamimi / Clifford Chance', estimatedFormationCost: 18000
      };
    }

    // Default: Cayman offshore
    return {
      name: 'Antoninus Fund', type: 'MAIN_FUND',
      jurisdiction: 'Cayman Islands', vehicleType: 'Exempted Limited Partnership',
      registeredAgent: 'Maples & Calder / Walkers / Carey Olsen', estimatedFormationCost: 25000
    };
  }

  _estimateBlockersNeeded(investmentFocus) {
    if (investmentFocus?.debtFinanced) return 3;
    if (investmentFocus?.operatingBusinesses) return 2;
    return 1;
  }

  _generateStructureDiagram(structures) {
    const gp = structures.find(s => s.type === 'GENERAL_PARTNER');
    const mgmt = structures.find(s => s.type === 'MANAGEMENT_COMPANY');
    const funds = structures.filter(s => ['MAIN_FUND', 'PARALLEL_FUND', 'OFFSHORE_FUND'].includes(s.type));
    const blockers = structures.filter(s => s.type === 'BLOCKER');

    return {
      topLevel: [gp?.name, mgmt?.name].filter(Boolean),
      fundLevel: funds.map(f => f.name),
      vehicleLevel: blockers.map(b => b.name),
      coInvest: structures.filter(s => s.type === 'CO_INVEST').map(s => s.name),
      flowDescription: `${mgmt?.name} (fees) → ${gp?.name} (carry) → Fund vehicles → Portfolio investments`
    };
  }

  _getKeyConsiderations(strategy, lpBase) {
    const considerations = [];
    if (lpBase.hasErisaInvestors) considerations.push('ERISA parallel fund needed to manage 25% BPI test');
    if (lpBase.hasForeignInvestors) considerations.push('Offshore vehicle recommended for non-US investor tax efficiency');
    if (lpBase.hasTaxExemptInvestors) considerations.push('Blocker entities needed to prevent UBTI for tax-exempt LPs');
    if (lpBase.hasSovereignWealth) considerations.push('Sovereign immunity provisions in LPA');
    if (strategy === 'venture') considerations.push('Consider deal-by-deal carry structure (American waterfall)');
    if (strategy === 'buyout') considerations.push('European waterfall standard; subscription line for IRR management');
    return considerations;
  }

  _getScoringCriteria(category) {
    const criteria = {
      'FUND_ADMINISTRATOR': [
        { name: 'PE/VC Experience', weight: 0.20 },
        { name: 'Technology & Portal', weight: 0.15 },
        { name: 'Reporting Quality', weight: 0.15 },
        { name: 'Responsiveness', weight: 0.15 },
        { name: 'Pricing', weight: 0.15 },
        { name: 'Scalability', weight: 0.10 },
        { name: 'References', weight: 0.10 }
      ],
      'AUDITOR': [
        { name: 'Fund Audit Experience', weight: 0.25 },
        { name: 'Team Quality', weight: 0.20 },
        { name: 'Pricing', weight: 0.20 },
        { name: 'Timeliness', weight: 0.15 },
        { name: 'Global Reach', weight: 0.10 },
        { name: 'References', weight: 0.10 }
      ],
      'LEGAL_COUNSEL': [
        { name: 'Fund Formation Expertise', weight: 0.25 },
        { name: 'Regulatory Knowledge', weight: 0.20 },
        { name: 'Responsiveness', weight: 0.20 },
        { name: 'Pricing', weight: 0.15 },
        { name: 'LP Negotiations', weight: 0.10 },
        { name: 'References', weight: 0.10 }
      ]
    };
    return criteria[category] || criteria['FUND_ADMINISTRATOR'];
  }
}

module.exports = new FundFormationService();
