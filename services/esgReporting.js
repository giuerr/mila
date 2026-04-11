/**
 * ESG / Impact Reporting Service
 * SFDR, UN PRI, carbon metrics, DEI tracking, impact KPIs,
 * portfolio-level ESG scoring.
 */

class EsgReportingService {

  /**
   * Generate portfolio-level ESG scorecard
   */
  generateScorecard(companies) {
    const scores = companies.map(co => {
      const eScore = this._calculatePillarScore(co.esg?.environmental);
      const sScore = this._calculatePillarScore(co.esg?.social);
      const gScore = this._calculatePillarScore(co.esg?.governance);
      const totalScore = (eScore * 0.33 + sScore * 0.33 + gScore * 0.34);

      return {
        companyName: co.name,
        sector: co.sector,
        environmental: { score: eScore, metrics: co.esg?.environmental },
        social: { score: sScore, metrics: co.esg?.social },
        governance: { score: gScore, metrics: co.esg?.governance },
        totalScore: parseFloat(totalScore.toFixed(1)),
        rating: totalScore >= 80 ? 'A' : totalScore >= 60 ? 'B' : totalScore >= 40 ? 'C' : 'D',
        dataCompleteness: this._dataCompleteness(co.esg)
      };
    });

    const avgScore = scores.reduce((s, c) => s + c.totalScore, 0) / scores.length;

    return {
      portfolioScore: parseFloat(avgScore.toFixed(1)),
      portfolioRating: avgScore >= 80 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : 'D',
      companies: scores,
      topPerformers: scores.filter(s => s.rating === 'A').map(s => s.companyName),
      improvementNeeded: scores.filter(s => s.rating === 'D').map(s => s.companyName),
      averageDataCompleteness: parseFloat((scores.reduce((s, c) => s + c.dataCompleteness, 0) / scores.length).toFixed(1)) + '%'
    };
  }

  /**
   * Carbon footprint / climate metrics
   */
  calculateCarbonMetrics(companies) {
    let totalScope1 = 0, totalScope2 = 0, totalScope3 = 0;
    let totalRevenue = 0;

    const companyMetrics = companies.map(co => {
      const scope1 = co.carbon?.scope1 || 0; // tCO2e
      const scope2 = co.carbon?.scope2 || 0;
      const scope3 = co.carbon?.scope3 || 0;
      const revenue = co.revenue || 0;
      const intensity = revenue > 0 ? (scope1 + scope2) / (revenue / 1000000) : 0;

      totalScope1 += scope1;
      totalScope2 += scope2;
      totalScope3 += scope3;
      totalRevenue += revenue;

      return {
        companyName: co.name,
        scope1: scope1,
        scope2: scope2,
        scope3: scope3,
        totalEmissions: scope1 + scope2 + scope3,
        carbonIntensity: parseFloat(intensity.toFixed(2)), // tCO2e per $M revenue
        yoyChange: co.carbon?.yoyChange || null,
        reductionTarget: co.carbon?.reductionTarget || null,
        scienceBasedTarget: co.carbon?.sbt || false
      };
    });

    return {
      portfolioTotalEmissions: {
        scope1: totalScope1,
        scope2: totalScope2,
        scope3: totalScope3,
        total: totalScope1 + totalScope2 + totalScope3
      },
      portfolioCarbonIntensity: totalRevenue > 0
        ? parseFloat(((totalScope1 + totalScope2) / (totalRevenue / 1000000)).toFixed(2))
        : null,
      weightedAverageCarbonIntensity: 'WACI calculation requires investment weight',
      companies: companyMetrics,
      companiesWithSBT: companyMetrics.filter(c => c.scienceBasedTarget).length,
      dataAvailability: parseFloat(((companies.filter(c => c.carbon?.scope1 !== undefined).length / companies.length) * 100).toFixed(1)) + '%'
    };
  }

  /**
   * DEI (Diversity, Equity & Inclusion) metrics
   */
  calculateDeiMetrics({ firmLevel, portfolioLevel }) {
    return {
      firm: {
        totalEmployees: firmLevel.totalEmployees,
        genderDiversity: {
          female: firmLevel.female,
          male: firmLevel.male,
          nonBinary: firmLevel.nonBinary || 0,
          femalePct: parseFloat(((firmLevel.female / firmLevel.totalEmployees) * 100).toFixed(1)) + '%'
        },
        seniorLeadership: {
          female: firmLevel.seniorFemale,
          total: firmLevel.seniorTotal,
          femalePct: parseFloat(((firmLevel.seniorFemale / firmLevel.seniorTotal) * 100).toFixed(1)) + '%'
        },
        investmentTeam: {
          female: firmLevel.investmentFemale,
          total: firmLevel.investmentTotal,
          femalePct: parseFloat(((firmLevel.investmentFemale / firmLevel.investmentTotal) * 100).toFixed(1)) + '%'
        },
        ethnicDiversity: firmLevel.ethnicBreakdown || null,
        boardDiversity: firmLevel.boardDiversity || null
      },
      portfolio: portfolioLevel ? {
        companiesReporting: portfolioLevel.reporting,
        avgBoardFemale: portfolioLevel.avgBoardFemale,
        avgCsuiteFemale: portfolioLevel.avgCsuiteFemale,
        companiesWithDeiPolicy: portfolioLevel.withDeiPolicy,
        companiesWithPayEquityAudit: portfolioLevel.withPayEquityAudit
      } : null,
      benchmarks: {
        industryAvgFemaleInvestmentTeam: '21%', // ILPA benchmark
        industryAvgFemaleBoard: '27%',
        note: 'Benchmarks from ILPA Diversity Metrics Template'
      }
    };
  }

  /**
   * SFDR (Sustainable Finance Disclosure Regulation) reporting
   */
  generateSfdrReport({ fund, classification, paiIndicators }) {
    return {
      fundName: fund.name,
      sfdrClassification: classification, // ARTICLE_6, ARTICLE_8, ARTICLE_9
      reportingPeriod: fund.reportingPeriod,
      preContractualDisclosure: {
        sustainableInvestmentObjective: classification === 'ARTICLE_9',
        promotesEsCharacteristics: classification === 'ARTICLE_8',
        sustainableInvestmentPct: fund.sustainableInvestmentPct || null,
        taxonomyAlignedPct: fund.taxonomyAlignedPct || null,
        doNoSignificantHarm: fund.dnshAssessment || null
      },
      principalAdverseImpacts: (paiIndicators || []).map(pai => ({
        indicator: pai.name,
        metric: pai.metric,
        value: pai.value,
        unit: pai.unit,
        explanation: pai.explanation,
        actionsTaken: pai.actions
      })),
      periodicDisclosure: {
        sustainableInvestmentsMade: fund.sustainableInvestmentsMade,
        esgIntegrationApproach: fund.esgApproach,
        engagementActivities: fund.engagementActivities,
        votingRecord: fund.votingRecord
      },
      websiteDisclosure: {
        required: classification !== 'ARTICLE_6',
        url: fund.esgWebsiteUrl || 'TO_BE_PUBLISHED'
      }
    };
  }

  /**
   * UN PRI reporting data
   */
  generatePriReportingData({ firm, funds, reportingYear }) {
    return {
      signatoryName: firm.name,
      signatoryType: 'Investment Manager',
      aum: firm.totalAum,
      reportingYear,
      modules: {
        organisationalOverview: {
          esgPolicy: firm.hasEsgPolicy,
          responsibleInvestmentPolicy: firm.hasRiPolicy,
          esgTeamSize: firm.esgTeamSize,
          boardOversight: firm.boardEsgOversight,
          esgInCompensation: firm.esgLinkedCompensation
        },
        strategyAndGovernance: {
          esgInInvestmentProcess: firm.esgInProcess,
          esgDueDiligence: firm.esgDueDiligence,
          esgMonitoring: firm.esgMonitoring,
          esgReporting: firm.esgReportingToLps,
          climateStrategy: firm.climateStrategy
        },
        privateEquityModule: {
          esgInPreInvestment: firm.esgPreInvestment,
          esgInOwnership: firm.esgInOwnership,
          esgAtExit: firm.esgAtExit,
          valueCreationFromEsg: firm.esgValueCreation,
          casesStudies: firm.esgCaseStudies || []
        }
      },
      assessmentScore: firm.priScore || null,
      transparency: 'PUBLIC' // PRI reports are public
    };
  }

  // ==================== JURISDICTION ESG REGIMES ====================

  /**
   * Get jurisdiction-specific ESG/sustainability regulatory requirements
   */
  getJurisdictionEsgRequirements(jurisdiction) {
    const regimes = {

      // --- US ---
      US: {
        frameworks: [
          {
            name: 'SEC Climate Disclosure Rule',
            mandatory: true, effectiveDate: '2026-01-01',
            requirements: ['Scope 1 & 2 GHG emissions (phased)', 'Climate risk governance & strategy', 'Financial impact of climate risks', 'Transition plan disclosure'],
            applicability: 'SEC registrants (phased by filer type)',
            note: 'Subject to legal challenges — monitor status'
          },
          {
            name: 'SEC ESG Fund Naming Rule (Names Rule Amendment)',
            mandatory: true, effectiveDate: '2024-12-01',
            requirements: ['80% investment policy for ESG-named funds', 'Prospectus ESG strategy disclosure', 'Anti-greenwashing provisions'],
            applicability: 'Registered investment funds with ESG in name'
          },
          {
            name: 'DOL ESG Rule (ERISA)',
            mandatory: true, effectiveDate: '2023-01-30',
            requirements: ['ESG factors permitted as pecuniary factors', 'Fiduciary duty framework for ESG integration', 'Shareholder engagement rights'],
            applicability: 'ERISA-governed retirement plans'
          }
        ]
      },

      // --- EU-wide (applies to all EU member states + EEA) ---
      EU: {
        frameworks: [
          {
            name: 'SFDR (Sustainable Finance Disclosure Regulation)',
            mandatory: true, effectiveDate: '2021-03-10',
            classification: ['Article 6', 'Article 8 (light green)', 'Article 9 (dark green)'],
            requirements: ['Pre-contractual ESG disclosures', 'Periodic ESG reporting', 'Website disclosures', 'PAI (Principal Adverse Impacts) statement'],
            paiIndicators: 18, // 18 mandatory PAI indicators
            reportingFrequency: 'Annual'
          },
          {
            name: 'EU Taxonomy Regulation',
            mandatory: true, effectiveDate: '2022-01-01',
            requirements: ['Taxonomy-aligned activity %', 'DNSH (Do No Significant Harm) assessment', 'Minimum safeguards compliance', '6 environmental objectives alignment'],
            objectives: ['Climate change mitigation', 'Climate change adaptation', 'Water & marine resources', 'Circular economy', 'Pollution prevention', 'Biodiversity']
          },
          {
            name: 'CSRD (Corporate Sustainability Reporting Directive)',
            mandatory: true, effectiveDate: '2024-01-01',
            requirements: ['Double materiality assessment', 'ESRS (European Sustainability Reporting Standards)', 'Limited assurance on sustainability reporting'],
            applicability: 'Large undertakings & listed SMEs (phased from 2024-2028)'
          }
        ]
      },

      // --- UK ---
      UK: {
        frameworks: [
          {
            name: 'UK SDR (Sustainability Disclosure Requirements)',
            mandatory: true, effectiveDate: '2024-11-01',
            classification: ['Sustainability Focus', 'Sustainability Improvers', 'Sustainability Impact', 'Sustainability Mixed Goals'],
            requirements: ['Product-level disclosures', 'Anti-greenwashing rule', 'Consumer-facing labels', 'Entity-level reporting'],
            reportingFrequency: 'Annual'
          },
          {
            name: 'TCFD (Task Force on Climate-related Financial Disclosures)',
            mandatory: true, effectiveDate: '2022-04-06',
            requirements: ['Governance disclosures', 'Strategy (scenario analysis)', 'Risk management processes', 'Metrics & targets (Scope 1, 2, 3)'],
            applicability: 'FCA-regulated firms with >£5bn AUM'
          },
          {
            name: 'UK Green Taxonomy',
            mandatory: false, status: 'In development',
            requirements: ['Expected to align broadly with EU Taxonomy', 'UK-specific thresholds and criteria']
          }
        ]
      },

      // --- Singapore ---
      SINGAPORE: {
        frameworks: [
          {
            name: 'MAS Environmental Risk Management Guidelines',
            mandatory: true, effectiveDate: '2022-06-01',
            requirements: ['Governance & strategy for environmental risk', 'Risk management framework', 'Scenario analysis for climate risk', 'Disclosure of environmental risk policies'],
            reportingFrequency: 'Annual'
          },
          {
            name: 'Singapore-Asia Taxonomy (GFIT)',
            mandatory: false, effectiveDate: '2023-12-01',
            requirements: ['Traffic light system (green/amber/red)', 'Transition finance recognition', 'ASEAN-specific thresholds'],
            sectors: ['Energy', 'Real Estate', 'Transport', 'Agriculture']
          },
          {
            name: 'SGX Sustainability Reporting',
            mandatory: true, effectiveDate: '2022-01-01',
            requirements: ['Climate-related disclosures (TCFD-aligned)', 'Board diversity targets', 'Scope 1 & 2 emissions'],
            applicability: 'Listed companies (extends to fund portfolio companies if listed)'
          }
        ]
      },

      // --- Hong Kong ---
      HONG_KONG: {
        frameworks: [
          {
            name: 'SFC Climate Risk Management Guidelines',
            mandatory: true, effectiveDate: '2022-08-20',
            requirements: ['Governance for climate risk', 'Investment management integration', 'Risk management processes', 'Enhanced TCFD-aligned disclosures'],
            applicability: 'SFC-licensed fund managers with >HK$8bn AUM'
          },
          {
            name: 'HKEX ESG Reporting Guide',
            mandatory: true, effectiveDate: '2020-07-01',
            requirements: ['Board ESG governance statement', 'Materiality assessment', 'KPI reporting (environmental & social)', 'Climate-related disclosures (TCFD)'],
            applicability: 'Listed companies (relevant for portfolio companies)'
          },
          {
            name: 'Hong Kong Green Taxonomy',
            mandatory: false, status: 'In development (HKMA)',
            requirements: ['Aligned with Common Ground Taxonomy (CGT)', 'China-EU interoperability focus']
          }
        ]
      },

      // --- ADGM & DIFC ---
      ADGM: {
        frameworks: [
          {
            name: 'ADGM Sustainable Finance Framework',
            mandatory: false, effectiveDate: '2023-01-01',
            requirements: ['ESG disclosure guidance', 'Green/sustainability-linked bond framework', 'Fund-level ESG integration disclosure'],
            reportingFrequency: 'Annual'
          },
          {
            name: 'Abu Dhabi Sustainable Finance Declaration',
            mandatory: false,
            requirements: ['Net-zero commitment alignment', 'Climate risk assessment', 'UAE Net Zero 2050 strategy alignment']
          }
        ]
      },
      DIFC: {
        frameworks: [
          {
            name: 'DFSA ESG Disclosure Requirements',
            mandatory: false, effectiveDate: '2023-01-01',
            requirements: ['ESG integration policy disclosure', 'Green/ESG fund labelling', 'Climate-related risk disclosure'],
            reportingFrequency: 'Annual'
          },
          {
            name: 'Dubai Green Finance Framework',
            mandatory: false,
            requirements: ['Alignment with UAE Energy Strategy 2050', 'Green bond/sukuk framework']
          }
        ]
      },

      // --- Switzerland ---
      SWITZERLAND: {
        frameworks: [
          {
            name: 'AMAS Self-Regulation (Sustainable Finance)',
            mandatory: true, effectiveDate: '2023-09-30',
            requirements: ['ESG preferences in investor suitability', 'Transparency on ESG approaches', 'Greenwashing prevention rules'],
            applicability: 'AMAS member fund managers'
          },
          {
            name: 'Swiss Climate Disclosure Ordinance',
            mandatory: true, effectiveDate: '2024-01-01',
            requirements: ['TCFD-aligned reporting', 'Scope 1, 2, 3 emissions', 'Climate transition plan', 'Scenario analysis'],
            applicability: 'Large Swiss companies & financial institutions (500+ employees)'
          },
          {
            name: 'Swiss Sustainable Finance (SSF) Guidelines',
            mandatory: false,
            requirements: ['Best-practice ESG integration', 'Impact measurement', 'Stewardship & engagement']
          }
        ]
      },

      // --- Offshore jurisdictions (lighter regimes) ---
      CAYMAN: {
        frameworks: [
          {
            name: 'CIMA ESG Guidance (voluntary)',
            mandatory: false,
            requirements: ['No mandatory ESG framework', 'Follows investor demand for ESG disclosure', 'SFDR applies if marketing to EU investors'],
            note: 'Cayman funds marketing to EU must comply with SFDR via AIFMD passport or NPPR'
          }
        ]
      },
      BVI: {
        frameworks: [
          {
            name: 'BVI FSC ESG Guidance (voluntary)',
            mandatory: false,
            requirements: ['No mandatory ESG framework', 'SFDR applies if marketing to EU investors'],
            note: 'Follow home-jurisdiction ESG rules of fund manager or marketing jurisdiction'
          }
        ]
      },
      GUERNSEY: {
        frameworks: [
          {
            name: 'Guernsey Green Fund Regime',
            mandatory: false, effectiveDate: '2018-07-01',
            requirements: ['World-first regulated green fund product', 'Independent ESG verification', 'Green criteria aligned with EU Taxonomy principles'],
            note: 'Voluntary label — first regulated green fund designation globally'
          }
        ]
      },
      JERSEY: {
        frameworks: [
          {
            name: 'Jersey Finance Sustainable Finance Framework',
            mandatory: false, effectiveDate: '2021-01-01',
            requirements: ['ESG disclosure guidance for funds', 'TCFD-aligned reporting encouraged', 'Alignment with UK SDR expected'],
            note: 'Following UK trajectory on mandatory climate disclosure'
          }
        ]
      },

      // --- Nordics (strong ESG culture) ---
      DENMARK: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          {
            name: 'Danish §99a/b Reporting',
            mandatory: true,
            requirements: ['CSR reporting for large companies', 'Gender diversity reporting', 'Human rights due diligence'],
            applicability: 'Large companies (extended to portfolio level)'
          }
        ]
      },
      SWEDEN: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          {
            name: 'Swedish Annual Accounts Act (ÅRL) Sustainability',
            mandatory: true,
            requirements: ['Sustainability report for large companies', 'Environmental, social, HR, anti-corruption', 'Supply chain due diligence'],
            applicability: 'Companies exceeding size thresholds'
          }
        ]
      },
      NORWAY: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EEA member — EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EEA member — EU-wide (see EU frameworks)' },
          {
            name: 'Norwegian Transparency Act (Åpenhetsloven)',
            mandatory: true, effectiveDate: '2022-07-01',
            requirements: ['Human rights & decent work due diligence', 'Supply chain transparency', 'Public due diligence statement'],
            applicability: 'Large and mid-size enterprises'
          }
        ]
      },
      FINLAND: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          {
            name: 'Finnish Corporate Governance Code (ESG)',
            mandatory: true,
            requirements: ['Board diversity targets', 'Sustainability reporting', 'Remuneration linked to ESG KPIs'],
            applicability: 'Listed companies / large funds'
          }
        ]
      },

      // --- Other EU states ---
      IRELAND: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          {
            name: 'CBI SFDR Expectations',
            mandatory: true,
            requirements: ['CBI Dear Chair letter compliance', 'Fund naming convention alignment with ESG claims', 'Substance over labelling'],
            note: 'CBI has been a leading voice on SFDR enforcement'
          }
        ]
      },
      LUXEMBOURG: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          {
            name: 'LuxFLAG Labels',
            mandatory: false,
            requirements: ['ESG, Climate Finance, Environment, Microfinance, Green Bond labels', 'Independent verification', 'Annual compliance check'],
            note: 'Voluntary labelling agency — widely used in Luxembourg fund industry'
          }
        ]
      },
      FRANCE: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          {
            name: 'Article 29 Energy-Climate Law (LEC)',
            mandatory: true, effectiveDate: '2022-01-01',
            requirements: ['Biodiversity impact reporting', 'Coal & fossil fuel exposure', 'Paris Agreement alignment strategy', 'Scope 3 emissions estimation'],
            applicability: 'Asset managers with >€500M AUM'
          },
          {
            name: 'Label ISR / Greenfin',
            mandatory: false,
            requirements: ['State-backed SRI label (reformed 2024)', 'Greenfin label for green funds (excl. fossil fuels)'],
            note: 'Label ISR reformed in 2024 — stricter criteria, fossil fuel exclusions'
          }
        ]
      },
      GERMANY: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          {
            name: 'BaFin Sustainable Investment Guidelines',
            mandatory: true, effectiveDate: '2022-08-01',
            requirements: ['Guidelines for fund naming ("sustainable", "ESG", "green")', 'Minimum 75% sustainable investments for labelled funds', 'Exclusion criteria enforcement'],
            note: 'BaFin strict on greenwashing — fund naming must match substance'
          }
        ]
      },
      NETHERLANDS: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          {
            name: 'Dutch Climate Agreement (Klimaatakkoord)',
            mandatory: false,
            requirements: ['Financial sector commitment to measure & report financed emissions', 'Engagement & stewardship expectations', '2030 CO2 reduction targets'],
            note: 'Voluntary but industry-wide commitment'
          }
        ]
      },
      ITALY: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          {
            name: 'CONSOB ESG Disclosure Requirements',
            mandatory: true,
            requirements: ['Non-financial statement (DNF) for large entities', 'ESG risk integration in investment process', 'MiFID II ESG suitability integration'],
            note: 'CONSOB actively supervising SFDR compliance'
          }
        ]
      },
      SPAIN: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          {
            name: 'Spanish Climate Change Act (Ley 7/2021)',
            mandatory: true, effectiveDate: '2021-05-21',
            requirements: ['Climate risk assessment in financial decisions', 'Carbon footprint reporting', 'Paris Agreement alignment'],
            applicability: 'Large financial institutions and fund managers'
          }
        ]
      },

      // --- Baltics ---
      ESTONIA: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' }
        ]
      },
      LITHUANIA: {
        frameworks: [
          { name: 'SFDR', mandatory: true, note: 'EU-wide (see EU frameworks)' },
          { name: 'EU Taxonomy', mandatory: true, note: 'EU-wide (see EU frameworks)' }
        ]
      }
    };

    // EU member states inherit EU-wide frameworks
    const euMembers = ['LUXEMBOURG', 'IRELAND', 'FRANCE', 'GERMANY', 'NETHERLANDS', 'ITALY', 'SPAIN', 'DENMARK', 'SWEDEN', 'FINLAND', 'ESTONIA', 'LITHUANIA'];
    if (euMembers.includes(jurisdiction)) {
      const local = regimes[jurisdiction];
      const euWide = regimes.EU;
      return {
        jurisdiction,
        euWideFrameworks: euWide.frameworks,
        localFrameworks: local?.frameworks?.filter(f => f.name !== 'SFDR' && f.name !== 'EU Taxonomy') || [],
        totalFrameworks: (euWide.frameworks?.length || 0) + (local?.frameworks?.filter(f => !f.note?.includes('EU-wide'))?.length || 0)
      };
    }

    // Norway is EEA — also inherits EU
    if (jurisdiction === 'NORWAY') {
      const local = regimes.NORWAY;
      const euWide = regimes.EU;
      return {
        jurisdiction,
        euWideFrameworks: euWide.frameworks,
        localFrameworks: local?.frameworks?.filter(f => !f.note?.includes('EU-wide')) || [],
        totalFrameworks: (euWide.frameworks?.length || 0) + (local?.frameworks?.filter(f => !f.note?.includes('EU-wide'))?.length || 0),
        note: 'Norway is EEA member — SFDR/Taxonomy apply via EEA Agreement'
      };
    }

    return regimes[jurisdiction] ? {
      jurisdiction,
      frameworks: regimes[jurisdiction].frameworks,
      totalFrameworks: regimes[jurisdiction].frameworks.length
    } : null;
  }

  /**
   * Get all jurisdiction ESG requirements
   */
  getAllEsgRequirements() {
    const jurisdictions = [
      'US', 'CAYMAN', 'BVI', 'GUERNSEY', 'JERSEY', 'ADGM', 'DIFC',
      'HONG_KONG', 'SINGAPORE', 'UK', 'LUXEMBOURG', 'IRELAND', 'FRANCE',
      'GERMANY', 'NETHERLANDS', 'ITALY', 'SPAIN', 'DENMARK', 'SWEDEN',
      'NORWAY', 'FINLAND', 'ESTONIA', 'LITHUANIA', 'SWITZERLAND'
    ];
    const all = {};
    for (const j of jurisdictions) {
      all[j] = this.getJurisdictionEsgRequirements(j);
    }
    return all;
  }

  // --- Private ---

  _calculatePillarScore(metrics) {
    if (!metrics) return 0;
    const scores = Object.values(metrics).filter(v => typeof v === 'number');
    return scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
  }

  _dataCompleteness(esg) {
    if (!esg) return 0;
    const allFields = [
      ...(esg.environmental ? Object.values(esg.environmental) : []),
      ...(esg.social ? Object.values(esg.social) : []),
      ...(esg.governance ? Object.values(esg.governance) : [])
    ];
    const populated = allFields.filter(v => v !== null && v !== undefined).length;
    return allFields.length > 0 ? (populated / allFields.length) * 100 : 0;
  }
}

module.exports = new EsgReportingService();
