/**
 * Tax Engine Service
 * K-1 preparation, withholding tax, FATCA/CRS, PFIC, ECI, UBTI,
 * tax lot tracking, state nexus analysis.
 */

class TaxEngineService {

  // ==================== K-1 / TAX ALLOCATION ====================

  /**
   * Generate K-1 data for all LPs (US partnership tax allocation)
   */
  generateK1Data({ fundTaxItems, lpInvestors, allocationMethod = 'capital_account' }) {
    const totalCapital = lpInvestors.reduce((sum, lp) => sum + lp.capitalAccount, 0);

    return lpInvestors.map(lp => {
      const allocPct = lp.capitalAccount / totalCapital;

      // Allocate each tax item pro-rata (simplified — Section 704 may require special allocations)
      const allocations = {};
      for (const [item, amount] of Object.entries(fundTaxItems)) {
        allocations[item] = parseFloat((amount * allocPct).toFixed(2));
      }

      return {
        lpId: lp.id,
        lpName: lp.name,
        tin: lp.taxId,
        entityType: lp.entityType,
        capitalAccountBeginning: lp.capitalAccountBeginning,
        capitalContributions: lp.contributions,
        capitalWithdrawals: lp.withdrawals,
        capitalAccountEnding: lp.capitalAccount,
        allocationPercentage: parseFloat((allocPct * 100).toFixed(4)),
        allocations: {
          ordinaryIncome: allocations.ordinaryIncome || 0,
          netRentalIncome: allocations.netRentalIncome || 0,
          interestIncome: allocations.interestIncome || 0,
          dividendIncome: allocations.dividendIncome || 0,
          qualifiedDividends: allocations.qualifiedDividends || 0,
          royalties: allocations.royalties || 0,
          netShortTermCapitalGain: allocations.netShortTermCapitalGain || 0,
          netLongTermCapitalGain: allocations.netLongTermCapitalGain || 0,
          unrecouperableSection1231Loss: allocations.section1231 || 0,
          section179Deduction: allocations.section179 || 0,
          otherDeductions: allocations.otherDeductions || 0,
          selfEmploymentEarnings: allocations.selfEmployment || 0,
          foreignTaxesPaid: allocations.foreignTaxesPaid || 0,
          section199ADividends: allocations.section199A || 0
        },
        taxExemptIncome: allocations.taxExemptIncome || 0,
        nondeductibleExpenses: allocations.nondeductibleExpenses || 0
      };
    });
  }

  // ==================== WITHHOLDING TAX ====================

  /**
   * Calculate withholding tax on distributions to foreign LPs
   */
  calculateWithholding({ distributions, lpInvestors }) {
    return lpInvestors.map(lp => {
      const distribution = distributions.find(d => d.lpId === lp.id);
      if (!distribution) return null;

      const withholdingRate = this._getWithholdingRate(lp);
      const fdapIncome = distribution.interestIncome + distribution.dividendIncome + (distribution.otherFdap || 0);
      const withholdingAmount = fdapIncome * withholdingRate;

      return {
        lpId: lp.id,
        lpName: lp.name,
        jurisdiction: lp.jurisdiction,
        treatyCountry: lp.treatyCountry,
        w8Type: lp.w8Type, // W-8BEN, W-8BEN-E, W-8IMY, W-8ECI
        w8ExpiryDate: lp.w8ExpiryDate,
        w8Valid: new Date(lp.w8ExpiryDate) > new Date(),
        grossDistribution: distribution.totalAmount,
        fdapIncome,
        withholdingRate: (withholdingRate * 100) + '%',
        withholdingAmount: parseFloat(withholdingAmount.toFixed(2)),
        netDistribution: parseFloat((distribution.totalAmount - withholdingAmount).toFixed(2)),
        fatcaStatus: lp.fatcaStatus,
        form1042sRequired: withholdingAmount > 0
      };
    }).filter(Boolean);
  }

  // ==================== FATCA / CRS ====================

  /**
   * Generate FATCA reporting data (Form 8966)
   */
  generateFatcaReport({ fundEntity, lpInvestors, reportingYear }) {
    const usReportableAccounts = lpInvestors.filter(lp =>
      lp.fatcaClassification === 'US_PERSON' ||
      lp.fatcaClassification === 'US_OWNED_FOREIGN_ENTITY'
    );

    return {
      reportingFfi: fundEntity.name,
      ffiGiin: fundEntity.giin,
      reportingYear,
      reportableAccounts: usReportableAccounts.map(lp => ({
        accountHolder: lp.name,
        tin: lp.usTin,
        address: lp.address,
        accountNumber: lp.investorId,
        accountBalance: lp.capitalAccount,
        grossDividends: lp.dividendIncome || 0,
        grossInterest: lp.interestIncome || 0,
        grossProceeds: lp.grossProceeds || 0,
        otherIncome: lp.otherIncome || 0
      })),
      totalReportableAccounts: usReportableAccounts.length,
      totalReportableBalance: usReportableAccounts.reduce((sum, lp) => sum + lp.capitalAccount, 0)
    };
  }

  /**
   * Generate CRS reporting data
   */
  generateCrsReport({ fundEntity, lpInvestors, reportingJurisdiction, reportingYear }) {
    // CRS requires reporting on all accounts held by tax residents of other participating jurisdictions
    const crsReportable = lpInvestors.filter(lp =>
      lp.taxResidenceCountry !== reportingJurisdiction &&
      this._isCrsParticipant(lp.taxResidenceCountry)
    );

    // Group by jurisdiction for reporting
    const byJurisdiction = {};
    for (const lp of crsReportable) {
      const country = lp.taxResidenceCountry;
      if (!byJurisdiction[country]) byJurisdiction[country] = [];
      byJurisdiction[country].push({
        accountHolder: lp.name,
        tin: lp.localTin,
        taxResidence: country,
        dateOfBirth: lp.dob,
        address: lp.address,
        accountNumber: lp.investorId,
        accountBalance: lp.capitalAccount,
        grossIncome: (lp.dividendIncome || 0) + (lp.interestIncome || 0) + (lp.otherIncome || 0),
        entityType: lp.entityType,
        controllingPersons: lp.controllingPersons || []
      });
    }

    return {
      reportingEntity: fundEntity.name,
      reportingJurisdiction,
      reportingYear,
      accountsByJurisdiction: byJurisdiction,
      totalReportableAccounts: crsReportable.length,
      jurisdictionsCount: Object.keys(byJurisdiction).length
    };
  }

  // ==================== PFIC ====================

  /**
   * Identify PFICs in portfolio and generate annual information statements
   */
  identifyPfics(portfolioCompanies) {
    return portfolioCompanies.map(co => {
      const passiveIncomePct = co.passiveIncome / co.grossIncome;
      const passiveAssetPct = co.passiveAssets / co.totalAssets;
      const isPfic = passiveIncomePct >= 0.75 || passiveAssetPct >= 0.50;

      return {
        companyName: co.name,
        country: co.country,
        isPfic,
        passiveIncomeTest: {
          passiveIncome: co.passiveIncome,
          grossIncome: co.grossIncome,
          percentage: parseFloat((passiveIncomePct * 100).toFixed(2)),
          triggered: passiveIncomePct >= 0.75
        },
        assetTest: {
          passiveAssets: co.passiveAssets,
          totalAssets: co.totalAssets,
          percentage: parseFloat((passiveAssetPct * 100).toFixed(2)),
          triggered: passiveAssetPct >= 0.50
        },
        recommendation: isPfic
          ? 'PFIC identified. Consider QEF election or MTM election for US taxable investors.'
          : 'Not a PFIC. No action required.'
      };
    });
  }

  // ==================== ECI / UBTI ====================

  /**
   * Calculate ECI exposure for foreign LPs
   */
  calculateEciExposure(investments) {
    return investments.map(inv => {
      const hasEci = inv.conductsTradeBusiness && inv.jurisdiction === 'US';
      const eciAmount = hasEci ? inv.usSourceIncome : 0;

      return {
        investmentName: inv.name,
        hasEci,
        eciAmount,
        requiresBlocker: hasEci,
        blockerEntity: inv.blockerEntity || null,
        recommendation: hasEci && !inv.blockerEntity
          ? 'WARNING: ECI exposure without blocker. Foreign LPs will need to file US tax returns.'
          : hasEci
          ? `Blocked via ${inv.blockerEntity}`
          : 'No ECI exposure'
      };
    });
  }

  /**
   * Calculate UBTI exposure for tax-exempt LPs
   */
  calculateUbtiExposure(investments) {
    return investments.map(inv => {
      const leveraged = inv.debtFinanced || false;
      const operatingBusiness = inv.isTradeOrBusiness || false;
      const hasUbti = leveraged || operatingBusiness;

      let ubtiAmount = 0;
      if (leveraged && inv.acquisitionIndebtedness) {
        // UBTI from debt-financed property
        const debtRatio = inv.acquisitionIndebtedness / inv.adjustedBasis;
        ubtiAmount = inv.grossIncome * Math.min(debtRatio, 1);
      }
      if (operatingBusiness) {
        ubtiAmount += inv.operatingIncome || 0;
      }

      return {
        investmentName: inv.name,
        hasUbti,
        ubtiAmount: parseFloat(ubtiAmount.toFixed(2)),
        debtFinanced: leveraged,
        debtRatio: leveraged ? (inv.acquisitionIndebtedness / inv.adjustedBasis).toFixed(4) : null,
        operatingBusiness,
        blockerRecommended: ubtiAmount > 1000, // $1K de minimis
        recommendation: hasUbti
          ? `UBTI of ${ubtiAmount.toFixed(2)} — consider blocker entity for tax-exempt LPs`
          : 'No UBTI exposure'
      };
    });
  }

  // ==================== TAX LOT TRACKING ====================

  /**
   * Track tax lots for investments
   */
  trackTaxLots(lots) {
    return lots.map(lot => {
      const holdingDays = this._daysBetween(lot.acquisitionDate, lot.dispositionDate || new Date().toISOString());
      const isLongTerm = holdingDays > 365;
      const gainLoss = lot.proceeds ? lot.proceeds - lot.adjustedBasis : lot.currentValue - lot.adjustedBasis;

      return {
        lotId: lot.id,
        security: lot.security,
        acquisitionDate: lot.acquisitionDate,
        dispositionDate: lot.dispositionDate,
        shares: lot.shares,
        costBasis: lot.costBasis,
        adjustedBasis: lot.adjustedBasis,
        currentValue: lot.currentValue || lot.proceeds,
        gainLoss: parseFloat(gainLoss.toFixed(2)),
        holdingPeriodDays: holdingDays,
        character: isLongTerm ? 'LONG_TERM' : 'SHORT_TERM',
        washSaleDisallowed: lot.washSale || false,
        section754Adjustment: lot.section754Adj || 0,
        status: lot.dispositionDate ? 'REALIZED' : 'UNREALIZED'
      };
    });
  }

  // --- Private ---

  // ==================== JURISDICTION TAX PROFILES ====================

  /**
   * Get comprehensive tax profile for a jurisdiction
   */
  getJurisdictionTaxProfile(jurisdiction) {
    const profiles = {

      // --- Americas ---
      US: {
        jurisdiction: 'US', name: 'United States (Delaware)',
        corporateTaxRate: 0.21, capitalGainsTax: 0.20, maxCapGainsRate: 0.238, // 20% + 3.8% NIIT
        dividendWithholding: 0.30, interestWithholding: 0.30,
        fundVehicle: 'Limited Partnership', regulator: 'SEC',
        taxTreatyNetwork: true, crsParticipant: false, fatcaReporting: true,
        specialRegimes: ['Qualified Small Business Stock (QSBS) exclusion', 'Opportunity Zone deferrals', 'Carried interest 3-year holding (Section 1061)'],
        keyRules: ['Federal + state tax (DE: 0% on out-of-state income)', 'K-1 partnership tax allocation', 'PFIC/ECI/UBTI analysis required'],
        stampDuty: false, vatApplicable: false, wealthTax: false
      },
      CAYMAN: {
        jurisdiction: 'CAYMAN', name: 'Cayman Islands',
        corporateTaxRate: 0, capitalGainsTax: 0, dividendWithholding: 0, interestWithholding: 0,
        fundVehicle: 'Exempted Limited Partnership', regulator: 'CIMA',
        taxTreatyNetwork: false, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['Tax-neutral jurisdiction', '20-year tax exemption certificate', 'No direct taxes on funds'],
        keyRules: ['Economic substance requirements', 'Beneficial ownership regime', 'CIMA registration mandatory'],
        stampDuty: false, vatApplicable: false, wealthTax: false
      },

      // --- Offshore & Crown Dependencies ---
      BVI: {
        jurisdiction: 'BVI', name: 'British Virgin Islands',
        corporateTaxRate: 0, capitalGainsTax: 0, dividendWithholding: 0, interestWithholding: 0,
        fundVehicle: 'Limited Partnership', regulator: 'BVI FSC',
        taxTreatyNetwork: false, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['Tax-neutral jurisdiction', 'No stamp duty on share transfers', 'Approved/registered/private fund categories'],
        keyRules: ['Economic substance requirements (2019)', 'BOSS beneficial ownership system', 'Three fund categories with different regulatory burdens'],
        stampDuty: false, vatApplicable: false, wealthTax: false
      },
      GUERNSEY: {
        jurisdiction: 'GUERNSEY', name: 'Guernsey',
        corporateTaxRate: 0, capitalGainsTax: 0, dividendWithholding: 0, interestWithholding: 0,
        fundVehicle: 'Limited Partnership', regulator: 'GFSC',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['0% corporate tax for funds', 'Registered/authorised/qualifying fund regimes', 'No capital gains or inheritance tax'],
        keyRules: ['Economic substance requirements', 'GFSC POI (Protection of Investors) Law', 'Manager must be locally licensed or exempt'],
        stampDuty: false, vatApplicable: false, wealthTax: false
      },
      JERSEY: {
        jurisdiction: 'JERSEY', name: 'Jersey',
        corporateTaxRate: 0, capitalGainsTax: 0, dividendWithholding: 0, interestWithholding: 0,
        fundVehicle: 'Limited Partnership', regulator: 'JFSC',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['0% corporate tax for funds', 'JPF (Jersey Private Fund) — max 50 investors, fast-track', 'Expert Fund regime'],
        keyRules: ['Economic substance requirements', 'JFSC Codes of Practice', 'Functionary (fund admin) must be locally regulated'],
        stampDuty: false, vatApplicable: true, wealthTax: false
      },

      // --- Middle East ---
      ADGM: {
        jurisdiction: 'ADGM', name: 'Abu Dhabi Global Market',
        corporateTaxRate: 0, capitalGainsTax: 0, dividendWithholding: 0, interestWithholding: 0,
        fundVehicle: 'Investment Company / Limited Partnership', regulator: 'FSRA',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['0% tax in free zone (50 years)', 'UAE CT 9% does not apply to qualifying free zone income', 'No FX controls'],
        keyRules: ['FSRA Fund Rules 2023', 'Common law jurisdiction (English law basis)', 'VAT 5% on services (not fund returns)'],
        stampDuty: false, vatApplicable: true, wealthTax: false, vatRate: 0.05
      },
      DIFC: {
        jurisdiction: 'DIFC', name: 'Dubai International Financial Centre',
        corporateTaxRate: 0, capitalGainsTax: 0, dividendWithholding: 0, interestWithholding: 0,
        fundVehicle: 'Investment Company / Limited Partnership', regulator: 'DFSA',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['0% tax in free zone (50 years)', 'Qualifying Free Zone Person exemption from UAE CT', 'Domestic fund & external fund regimes'],
        keyRules: ['DFSA Collective Investment Rules (CIR)', 'UAE CT 9% may apply on non-qualifying income', 'Common law jurisdiction'],
        stampDuty: false, vatApplicable: true, wealthTax: false, vatRate: 0.05
      },

      // --- Asia-Pacific ---
      HONG_KONG: {
        jurisdiction: 'HONG_KONG', name: 'Hong Kong',
        corporateTaxRate: 0.165, capitalGainsTax: 0, dividendWithholding: 0, interestWithholding: 0,
        fundVehicle: 'Limited Partnership / OFC (Open-ended Fund Company)', regulator: 'SFC',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['Unified Fund Exemption (profits tax exemption for eligible funds)', 'Carried interest concession (0% tax on qualifying CI)', 'OFC/LPF grant schemes'],
        keyRules: ['Territorial tax system — only HK-sourced profits taxed', 'No capital gains tax', 'No withholding on dividends/interest to non-residents'],
        stampDuty: true, stampDutyRate: 0.0013, vatApplicable: false, wealthTax: false
      },
      SINGAPORE: {
        jurisdiction: 'SINGAPORE', name: 'Singapore',
        corporateTaxRate: 0.17, capitalGainsTax: 0, dividendWithholding: 0, interestWithholding: 0.15,
        fundVehicle: 'VCC (Variable Capital Company) / Limited Partnership', regulator: 'MAS',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['Section 13O (onshore fund tax exemption)', 'Section 13U (enhanced tier — offshore & onshore)', 'VCC umbrella structure with sub-funds'],
        keyRules: ['No capital gains tax', 'Territorial + remittance basis', 'GST 9% on management fees (may be irrecoverable for exempt funds)'],
        stampDuty: true, stampDutyRate: 0.004, vatApplicable: true, vatRate: 0.09, wealthTax: false
      },

      // --- UK ---
      UK: {
        jurisdiction: 'UK', name: 'United Kingdom',
        corporateTaxRate: 0.25, capitalGainsTax: 0.20, dividendWithholding: 0, interestWithholding: 0.20,
        fundVehicle: 'English Limited Partnership / Scottish LP', regulator: 'FCA',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['Investment manager exemption (IME)', 'Qualifying Asset Holding Company (QAHC)', 'UK REIT regime (for real estate funds)'],
        keyRules: ['Fund is tax-transparent (LP structure)', 'Carried interest taxed at 28% (2025+)', 'SDLT on UK property acquisitions'],
        stampDuty: true, stampDutyRate: 0.005, vatApplicable: true, vatRate: 0.20, wealthTax: false
      },

      // --- EU Member States ---
      LUXEMBOURG: {
        jurisdiction: 'LUXEMBOURG', name: 'Luxembourg',
        corporateTaxRate: 0.2483, capitalGainsTax: 0.2483, dividendWithholding: 0.15, interestWithholding: 0,
        fundVehicle: 'SCSp (Special Limited Partnership) / RAIF / SIF', regulator: 'CSSF',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['RAIF (no CSSF product approval needed)', 'SIF (Specialised Investment Fund — 0.01% sub tax)', 'SICAR (venture capital vehicle — exempt on qualifying income)', 'SCSp tax-transparent LP'],
        keyRules: ['SCSp is fully tax-transparent', 'RAIF/SIF have 0.01% subscription tax', 'EU Parent-Subsidiary Directive (0% WHT on dividends to EU parent)'],
        stampDuty: false, vatApplicable: true, vatRate: 0.17, wealthTax: true, wealthTaxRate: 0.005
      },
      IRELAND: {
        jurisdiction: 'IRELAND', name: 'Ireland',
        corporateTaxRate: 0.125, capitalGainsTax: 0.33, dividendWithholding: 0.25, interestWithholding: 0.20,
        fundVehicle: 'ILP (Investment Limited Partnership) / ICAV / QIAIF', regulator: 'CBI',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['QIAIF (Qualifying Investor AIF — exempt from Irish tax)', 'RIAIF (Retail Investor AIF)', 'Section 110 company for debt securitisation', 'ILP reform 2021 — modernised LP'],
        keyRules: ['QIAIFs exempt from Irish tax on income and gains', '12.5% CT rate for trading income', 'WHT exemptions under EU directives and treaties'],
        stampDuty: true, stampDutyRate: 0.01, vatApplicable: true, vatRate: 0.23, wealthTax: false
      },
      FRANCE: {
        jurisdiction: 'FRANCE', name: 'France',
        corporateTaxRate: 0.25, capitalGainsTax: 0.30, dividendWithholding: 0.2581, interestWithholding: 0,
        fundVehicle: 'SLP (Société de Libre Partenariat) / FPCI', regulator: 'AMF',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['FPCI (tax-transparent professional fund)', 'SLP (French LP — 2015, tax-transparent)', 'PFU flat tax 30% (12.8% income + 17.2% social charges)', 'Carried interest regime (if >5yr hold)'],
        keyRules: ['SLP/FPCI are tax-transparent', 'PFU applies to investment income for individuals', 'ATAD anti-avoidance rules (CFC, hybrid mismatch)'],
        stampDuty: false, vatApplicable: true, vatRate: 0.20, wealthTax: true, wealthTaxNote: 'IFI (real estate wealth tax only)'
      },
      GERMANY: {
        jurisdiction: 'GERMANY', name: 'Germany',
        corporateTaxRate: 0.2975, capitalGainsTax: 0.2638, dividendWithholding: 0.2638, interestWithholding: 0.2638,
        fundVehicle: 'KG (Kommanditgesellschaft) / InvKG / Spezial-AIF', regulator: 'BaFin',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['InvStG 2018 reform (opaque fund taxation)', 'Spezial-Investmentfonds (semi-transparent for institutional)', 'KG LP structure (tax-transparent)', '80% partial exemption on equity fund gains'],
        keyRules: ['InvStG: funds pay 15% CT on German income, investors get partial exemption', 'KG structure is fully transparent', 'Abgeltungsteuer 25% + soli 5.5% + church tax = ~26.4% on investment income'],
        stampDuty: false, vatApplicable: true, vatRate: 0.19, wealthTax: false
      },
      NETHERLANDS: {
        jurisdiction: 'NETHERLANDS', name: 'Netherlands',
        corporateTaxRate: 0.2569, capitalGainsTax: 0.2569, dividendWithholding: 0.15, interestWithholding: 0,
        fundVehicle: 'CV (Commanditaire Vennootschap) / FGR (Fund for Joint Account)', regulator: 'AFM / DNB',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['FBI (Fiscal Investment Institution — 0% CT if distributes 100%)', 'FGR (tax-transparent contractual fund)', 'CV (tax-transparent LP)', 'VBI (exempt investment institution for pension/sovereign)'],
        keyRules: ['CV/FGR are tax-transparent', 'FBI must distribute all profits', '15% WHT on dividends (reduced by treaty)'],
        stampDuty: false, vatApplicable: true, vatRate: 0.21, wealthTax: false
      },
      ITALY: {
        jurisdiction: 'ITALY', name: 'Italy',
        corporateTaxRate: 0.24, capitalGainsTax: 0.26, dividendWithholding: 0.26, interestWithholding: 0.26,
        fundVehicle: 'FIA (Fondo di Investimento Alternativo)', regulator: 'CONSOB / Banca d\'Italia',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['FIA reserved to qualified investors (exempt at fund level)', 'Carried interest regime (taxation as capital gain if conditions met)', 'ATAD implementation (CFC, GAAR, exit tax)'],
        keyRules: ['FIA is tax-exempt at fund level', 'Investors taxed on distribution at 26%', 'IRAP 3.9% regional tax on productive activities', 'IRES 24% + IRAP 3.9% for corporate investors'],
        stampDuty: true, stampDutyRate: 0.002, vatApplicable: true, vatRate: 0.22, wealthTax: true, wealthTaxNote: 'IVAFE 0.2% on foreign financial assets'
      },
      SPAIN: {
        jurisdiction: 'SPAIN', name: 'Spain',
        corporateTaxRate: 0.25, capitalGainsTax: 0.23, maxCapGainsRate: 0.28, dividendWithholding: 0.19, interestWithholding: 0.19,
        fundVehicle: 'FCR (Fondo de Capital Riesgo) / SCR (Sociedad de Capital Riesgo)', regulator: 'CNMV',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['ECR regime (99% exemption on capital gains from qualifying investees)', 'FCR tax-transparent vehicle', 'SCR at 1% effective CT rate on qualifying income', 'Carried interest taxed at savings rate (19-28%)'],
        keyRules: ['ECR must invest 60%+ in qualifying assets', 'Individuals: savings tax 19-28% bands', 'AEAT reporting obligations'],
        stampDuty: true, stampDutyRate: 0.015, vatApplicable: true, vatRate: 0.21, wealthTax: true, wealthTaxRate: 0.025
      },

      // --- Nordics ---
      DENMARK: {
        jurisdiction: 'DENMARK', name: 'Denmark',
        corporateTaxRate: 0.22, capitalGainsTax: 0.22, dividendWithholding: 0.27, interestWithholding: 0,
        fundVehicle: 'K/S (Kommanditselskab — Limited Partnership)', regulator: 'DFSA (Finanstilsynet)',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['K/S is fully tax-transparent', 'PAL tax on pension fund returns (15.3%)', 'Lagerbeskatning (mark-to-market on certain assets)'],
        keyRules: ['K/S transparent for Danish tax', 'PAL tax applies to Danish pension fund investors', 'No stamp duty on LP interests'],
        stampDuty: false, vatApplicable: true, vatRate: 0.25, wealthTax: false
      },
      SWEDEN: {
        jurisdiction: 'SWEDEN', name: 'Sweden',
        corporateTaxRate: 0.206, capitalGainsTax: 0.30, dividendWithholding: 0.30, interestWithholding: 0,
        fundVehicle: 'KB (Kommanditbolag — Limited Partnership)', regulator: 'FI (Finansinspektionen)',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['KB is tax-transparent', 'ISK (Investment Savings Account) — flat rate tax on deemed return', 'Carried interest taxed as employment income (Skatteverket guidance)'],
        keyRules: ['KB transparent for Swedish tax', '30% flat tax on capital income for individuals', 'WHT 30% on dividends (reduced by treaty)'],
        stampDuty: false, vatApplicable: true, vatRate: 0.25, wealthTax: false
      },
      NORWAY: {
        jurisdiction: 'NORWAY', name: 'Norway',
        corporateTaxRate: 0.22, capitalGainsTax: 0.22, dividendWithholding: 0.25, interestWithholding: 0,
        fundVehicle: 'KS (Kommandittselskap — Limited Partnership)', regulator: 'Finanstilsynet',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['KS is tax-transparent', 'Aksjonærmodellen (shareholder model) — 37.84% effective rate on dividends for individuals', 'Fritaksmetoden (participation exemption for corporate investors)'],
        keyRules: ['KS transparent for Norwegian tax', 'Wealth tax 1.1% (2025) on net assets above NOK 1.7M', 'Exit tax on emigration'],
        stampDuty: false, vatApplicable: true, vatRate: 0.25, wealthTax: true, wealthTaxRate: 0.011
      },
      FINLAND: {
        jurisdiction: 'FINLAND', name: 'Finland',
        corporateTaxRate: 0.20, capitalGainsTax: 0.30, maxCapGainsRate: 0.34, dividendWithholding: 0.20, interestWithholding: 0,
        fundVehicle: 'Ky (Kommandiittiyhtiö — Limited Partnership)', regulator: 'FIN-FSA',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['Ky is tax-transparent', 'Special investment fund (erikoissijoitusrahasto) exempt from CIT', '30%/34% progressive capital gains for individuals'],
        keyRules: ['Ky transparent for Finnish tax', '30% CGT up to €30K, 34% above', 'No stamp duty'],
        stampDuty: false, vatApplicable: true, vatRate: 0.255, wealthTax: false
      },

      // --- Baltics ---
      ESTONIA: {
        jurisdiction: 'ESTONIA', name: 'Estonia',
        corporateTaxRate: 0, capitalGainsTax: 0, dividendWithholding: 0.20, interestWithholding: 0,
        fundVehicle: 'UÜ (Usaldusühing — Limited Partnership)', regulator: 'EFSA (Finantsinspektsioon)',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['0% CIT on undistributed profits', '20% CIT on distributions (20/80 gross-up)', '14% reduced rate on regular dividends', 'e-Residency — remote company formation'],
        keyRules: ['Tax only on distribution — unique in EU', 'LP transparent for Estonian tax', 'No stamp duty, no capital gains tax at entity level'],
        stampDuty: false, vatApplicable: true, vatRate: 0.22, wealthTax: false
      },
      LITHUANIA: {
        jurisdiction: 'LITHUANIA', name: 'Lithuania',
        corporateTaxRate: 0.15, capitalGainsTax: 0.15, dividendWithholding: 0.15, interestWithholding: 0.10,
        fundVehicle: 'KŪB (Komanditinė ūkinė bendrija — Limited Partnership)', regulator: 'LB (Lietuvos Bankas)',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['0% CIT for collective investment undertakings', 'KŪB is tax-transparent', 'Participation exemption on qualifying shareholdings (>10%, 12 months)'],
        keyRules: ['CIU vehicles exempt from CIT', 'LP transparent for Lithuanian tax', '15% WHT on dividends to non-residents (reduced by treaty)'],
        stampDuty: false, vatApplicable: true, vatRate: 0.21, wealthTax: false
      },

      // --- Switzerland ---
      SWITZERLAND: {
        jurisdiction: 'SWITZERLAND', name: 'Switzerland',
        corporateTaxRate: 0.1197, capitalGainsTax: 0, dividendWithholding: 0.35, interestWithholding: 0.35,
        fundVehicle: 'KmGK (Kommanditgesellschaft für kollektive Kapitalanlagen) / L-QIF', regulator: 'FINMA',
        taxTreatyNetwork: true, crsParticipant: true, fatcaReporting: true,
        specialRegimes: ['L-QIF (Limited Qualified Investor Fund — no FINMA approval)', 'KmGK LP (Swiss limited partnership for collective investments)', 'Participation deduction (qualifying dividends)', 'Swiss stamp duty exemptions for qualifying restructurings'],
        keyRules: ['35% anticipatory tax (WHT) on Swiss-source dividends — refundable to treaty residents', 'No capital gains tax on securities for private investors', 'Stamp duty 0.15% on Swiss securities, 0.30% on foreign', 'Federal + cantonal/communal tax (effective rate 11.9-21%)'],
        stampDuty: true, stampDutyRate: 0.0015, vatApplicable: true, vatRate: 0.081, wealthTax: true, wealthTaxNote: 'Cantonal wealth tax on individuals (varies 0.1-1%)'
      }
    };

    return profiles[jurisdiction] || null;
  }

  /**
   * Get all jurisdiction profiles
   */
  getAllJurisdictionProfiles() {
    const jurisdictions = [
      'US', 'CAYMAN', 'BVI', 'GUERNSEY', 'JERSEY', 'ADGM', 'DIFC',
      'HONG_KONG', 'SINGAPORE', 'UK', 'LUXEMBOURG', 'IRELAND', 'FRANCE',
      'GERMANY', 'NETHERLANDS', 'ITALY', 'SPAIN', 'DENMARK', 'SWEDEN',
      'NORWAY', 'FINLAND', 'ESTONIA', 'LITHUANIA', 'SWITZERLAND'
    ];
    const profiles = {};
    for (const j of jurisdictions) {
      profiles[j] = this.getJurisdictionTaxProfile(j);
    }
    return profiles;
  }

  /**
   * Compare tax treatment across jurisdictions for a given investment scenario
   */
  compareJurisdictionTax({ investmentIncome, capitalGains, dividends, jurisdictions }) {
    return jurisdictions.map(j => {
      const profile = this.getJurisdictionTaxProfile(j);
      if (!profile) return { jurisdiction: j, error: 'Unknown jurisdiction' };

      const incomeTax = investmentIncome * profile.corporateTaxRate;
      const cgTax = capitalGains * profile.capitalGainsTax;
      const divWht = dividends * profile.dividendWithholding;
      const totalTax = incomeTax + cgTax + divWht;

      return {
        jurisdiction: j,
        name: profile.name,
        incomeTax: parseFloat(incomeTax.toFixed(2)),
        capitalGainsTax: parseFloat(cgTax.toFixed(2)),
        dividendWithholding: parseFloat(divWht.toFixed(2)),
        totalTax: parseFloat(totalTax.toFixed(2)),
        effectiveRate: parseFloat(((totalTax / (investmentIncome + capitalGains + dividends)) * 100).toFixed(2)) + '%',
        specialRegimes: profile.specialRegimes,
        notes: profile.keyRules
      };
    }).sort((a, b) => (a.totalTax || Infinity) - (b.totalTax || Infinity));
  }

  // --- Private ---

  _getWithholdingRate(lp) {
    if (lp.jurisdiction === 'US') return 0;
    const treatyRates = {
      // Americas & Offshore
      'KY': 0, 'BM': 0, 'BVI': 0, 'CA': 0.15, 'AU': 0.15,
      // Crown Dependencies
      'GG': 0, 'JE': 0,
      // Middle East
      'AE': 0, 'ADGM': 0, 'DIFC': 0,
      // Asia-Pacific
      'SG': 0, 'HK': 0, 'JP': 0.10,
      // UK
      'UK': 0.15, 'GB': 0.15,
      // EU — Western
      'LU': 0.15, 'IE': 0.15, 'FR': 0.15, 'DE': 0.15, 'NL': 0.15,
      'IT': 0.15, 'ES': 0.15, 'BE': 0.15, 'AT': 0.15, 'PT': 0.15,
      // EU — Nordics
      'DK': 0.15, 'SE': 0.15, 'NO': 0.15, 'FI': 0.15, 'IS': 0.15,
      // EU — Baltics & Eastern
      'EE': 0.15, 'LT': 0.15, 'LV': 0.15, 'PL': 0.15, 'CZ': 0.15,
      // Switzerland
      'CH': 0.15
    };
    return treatyRates[lp.treatyCountry] || 0.30;
  }

  _isCrsParticipant(country) {
    const nonParticipants = ['US']; // US uses FATCA, not CRS
    return !nonParticipants.includes(country);
  }

  _daysBetween(start, end) {
    return Math.floor((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
  }
}

module.exports = new TaxEngineService();
