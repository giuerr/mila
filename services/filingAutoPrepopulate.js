/**
 * Regulatory Filing Auto-Prepopulation
 * Connects compliance calendar to form templates and auto-fills
 * fund data into regulatory forms (CIMA, SEC, AIFMD, etc.).
 */

const db = require('../db/database');

class FilingAutoPrepopulateService {

  /**
   * Auto-prepopulate a filing with fund data
   */
  prepopulate({ filingId }) {
    if (!db.db) throw new Error('Database not initialized');

    const filing = db.findById('filings', filingId);
    if (!filing) throw new Error(`Filing ${filingId} not found`);

    const fund = filing.fund_id ? db.findById('funds', filing.fund_id) : null;
    if (!fund && filing.fund_id) throw new Error(`Fund ${filing.fund_id} not found`);

    // Get fund-level data
    const commitments = fund ? db.query('SELECT * FROM commitments WHERE fund_id = ?', [fund.id]) : [];
    const investors = fund ? db.query(
      'SELECT i.* FROM investors i JOIN commitments c ON i.id = c.investor_id WHERE c.fund_id = ?',
      [fund.id]
    ) : [];
    const investments = fund ? db.query('SELECT * FROM investments WHERE fund_id = ?', [fund.id]) : [];

    // Route to the correct form prepopulator
    const formData = this._getFormData(filing, fund, commitments, investors, investments);

    return {
      filingId: filing.id,
      filingName: filing.name,
      jurisdiction: filing.jurisdiction,
      filingType: filing.filing_type,
      deadline: filing.deadline,
      fundId: fund?.id,
      fundName: fund?.name,
      prepopulatedAt: new Date().toISOString(),
      status: 'PREPOPULATED',
      formData,
      reviewRequired: true,
      note: 'Auto-prepopulated from fund data. Review all fields before submission.'
    };
  }

  /**
   * Get all upcoming filings with prepopulation readiness
   */
  getUpcomingWithReadiness(daysAhead = 60) {
    if (!db.db) return [];

    const filings = db.getUpcomingFilings(daysAhead);

    return filings.map(f => {
      const fund = f.fund_id ? db.findById('funds', f.fund_id) : null;
      const hasData = fund && (fund.total_commitments > 0 || fund.nav > 0);

      return {
        filingId: f.id,
        name: f.name,
        jurisdiction: f.jurisdiction,
        filingType: f.filing_type,
        deadline: f.deadline,
        status: f.status,
        owner: f.owner,
        fundId: f.fund_id,
        fundName: fund?.name,
        canPrepopulate: hasData,
        dataCompleteness: this._assessDataCompleteness(fund, f.filing_type),
        daysUntilDeadline: f.deadline ? Math.floor((new Date(f.deadline) - Date.now()) / (1000 * 60 * 60 * 24)) : null
      };
    });
  }

  // --- Form-Specific Prepopulators ---

  _getFormData(filing, fund, commitments, investors, investments) {
    const jurisdiction = (filing.jurisdiction || '').toUpperCase();
    const filingType = (filing.filing_type || '').toUpperCase();

    if (jurisdiction === 'CAYMAN' || jurisdiction === 'KY') {
      return this._cimaForm(fund, commitments, investors, investments, filingType);
    } else if (jurisdiction === 'US' || jurisdiction === 'SEC') {
      return this._secForm(fund, commitments, investors, investments, filingType);
    } else if (jurisdiction === 'EU' || jurisdiction === 'AIFMD' || jurisdiction === 'LUXEMBOURG') {
      return this._aifmdForm(fund, commitments, investors, investments, filingType);
    }

    // Generic form
    return this._genericForm(fund, commitments, investors, investments);
  }

  _cimaForm(fund, commitments, investors, investments, filingType) {
    const totalCommitments = commitments.reduce((sum, c) => sum + c.commitment, 0);
    const totalCalled = commitments.reduce((sum, c) => sum + c.called_capital, 0);
    const totalInvestmentCost = investments.reduce((sum, i) => sum + (i.cost_basis || 0), 0);
    const totalInvestmentFV = investments.reduce((sum, i) => sum + (i.fair_value || 0), 0);

    return {
      formType: 'CIMA_ANNUAL_RETURN',
      sections: {
        fundDetails: {
          fundName: fund.name,
          registrationNumber: fund.id,
          jurisdiction: 'Cayman Islands',
          vehicleType: fund.vehicle_type || 'Exempted Limited Partnership',
          investmentManager: 'Antoninus Global SPC',
          administrator: fund.administrator || '',
          auditor: fund.auditor || '',
          legalCounsel: fund.legal_counsel || '',
          dateFiled: new Date().toISOString().split('T')[0]
        },
        financialData: {
          netAssetValue: fund.nav || 0,
          totalCommitments: totalCommitments,
          capitalCalled: totalCalled,
          totalInvestments: totalInvestmentFV,
          totalInvestmentCost: totalInvestmentCost,
          unrealizedGainLoss: totalInvestmentFV - totalInvestmentCost,
          numberOfInvestors: investors.length,
          numberOfInvestments: investments.length,
          currency: 'USD'
        },
        investorBreakdown: {
          totalInvestors: investors.length,
          byType: this._countBy(investors, 'entity_type'),
          byJurisdiction: this._countBy(investors, 'jurisdiction'),
          qualifiedPurchasers: investors.filter(i => i.qualified_purchaser).length,
          accredited: investors.filter(i => i.accredited).length
        },
        complianceDeclarations: {
          amlCompliant: investors.every(i => i.aml_status === 'CLEARED'),
          kycComplete: investors.every(i => i.kyc_status === 'APPROVED'),
          benefitPlanInvestors: investors.filter(i => i.is_benefit_plan).length,
          pepInvestors: investors.filter(i => i.is_pep).length
        }
      }
    };
  }

  _secForm(fund, commitments, investors, investments, filingType) {
    const totalCommitments = commitments.reduce((sum, c) => sum + c.commitment, 0);
    const usInvestors = investors.filter(i => i.jurisdiction === 'US' || i.tax_residence === 'US');

    return {
      formType: filingType === 'FORM_PF' ? 'SEC_FORM_PF' : 'SEC_FORM_ADV',
      sections: {
        fundIdentification: {
          fundName: fund.name,
          cikNumber: '',
          fileNumber: '',
          fiscalYearEnd: '12/31',
          fundType: 'Private Equity Fund',
          investmentStrategy: fund.vehicle_type || 'Buyout'
        },
        assetsUnderManagement: {
          regulatoryAUM: fund.nav || 0,
          grossAssetValue: fund.nav || 0,
          netAssetValue: fund.nav || 0,
          totalCommitments: totalCommitments
        },
        investorInformation: {
          totalInvestors: investors.length,
          usInvestors: usInvestors.length,
          nonUsInvestors: investors.length - usInvestors.length,
          qualifiedPurchasers: investors.filter(i => i.qualified_purchaser).length,
          benefitPlanAssets: investors.filter(i => i.is_benefit_plan).length,
          benefitPlanPct: investors.length > 0
            ? ((investors.filter(i => i.is_benefit_plan).length / investors.length) * 100).toFixed(1) + '%' : '0%'
        },
        borrowingAndDerivatives: {
          outstandingBorrowings: 0,
          creditFacilitySize: 0,
          derivativeExposure: 0
        }
      }
    };
  }

  _aifmdForm(fund, commitments, investors, investments, filingType) {
    const euInvestors = investors.filter(i =>
      ['EU', 'UK', 'DE', 'FR', 'LU', 'IE', 'NL', 'IT', 'ES'].includes(i.jurisdiction)
    );

    return {
      formType: 'AIFMD_ANNEX_IV',
      sections: {
        aifIdentification: {
          fundName: fund.name,
          leiCode: '',
          domicile: fund.jurisdiction || 'Cayman Islands',
          aifmName: 'Antoninus Global SPC',
          reportingPeriod: this._currentQuarter()
        },
        aifPrincipalInformation: {
          nav: fund.nav || 0,
          totalCommitments: commitments.reduce((sum, c) => sum + c.commitment, 0),
          investmentStrategy: 'Private Equity',
          predominantType: 'Buyout',
          currency: 'USD'
        },
        investorConcentration: {
          totalInvestors: investors.length,
          euInvestors: euInvestors.length,
          retailInvestors: 0,
          professionalInvestors: investors.length
        },
        leverage: {
          grossMethod: fund.nav > 0 ? '100%' : '0%',
          commitmentMethod: fund.nav > 0 ? '100%' : '0%'
        }
      }
    };
  }

  _genericForm(fund, commitments, investors, investments) {
    return {
      formType: 'GENERIC',
      sections: {
        fundDetails: {
          name: fund?.name || '',
          jurisdiction: fund?.jurisdiction || '',
          nav: fund?.nav || 0,
          totalCommitments: commitments.reduce((sum, c) => sum + c.commitment, 0),
          investorCount: investors.length,
          investmentCount: investments.length
        }
      }
    };
  }

  _assessDataCompleteness(fund, filingType) {
    if (!fund) return { score: 0, missing: ['fund data'] };
    const missing = [];
    if (!fund.nav) missing.push('NAV');
    if (!fund.total_commitments) missing.push('commitments');
    if (!fund.jurisdiction) missing.push('jurisdiction');
    const score = Math.max(0, 100 - (missing.length * 25));
    return { score, missing: missing.length > 0 ? missing : null };
  }

  _countBy(items, key) {
    const counts = {};
    for (const item of items) {
      const val = item[key] || 'Unknown';
      counts[val] = (counts[val] || 0) + 1;
    }
    return counts;
  }

  _currentQuarter() {
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    return `Q${q} ${now.getFullYear()}`;
  }
}

module.exports = new FilingAutoPrepopulateService();
