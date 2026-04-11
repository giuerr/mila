/**
 * Investor Onboarding Service
 * KYC/AML screening, subscription doc processing, accreditation verification,
 * ERISA monitoring, sanctions screening, investor classification.
 */

class InvestorOnboardingService {

  /**
   * Process new investor onboarding — full checklist
   */
  async processOnboarding(investor) {
    const checklist = this._getChecklistForType(investor.entityType);
    const riskScore = this._calculateRiskScore(investor);
    const kycStatus = this._evaluateKycDocuments(investor, checklist);
    const sanctionsResult = await this.screenSanctions(investor);
    const classification = this.classifyInvestor(investor);

    return {
      investorId: investor.id,
      investorName: investor.name,
      entityType: investor.entityType,
      jurisdiction: investor.jurisdiction,
      onboardingStatus: this._determineStatus(kycStatus, sanctionsResult, riskScore),
      riskScore,
      riskLevel: riskScore > 70 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW',
      kycStatus,
      sanctionsResult,
      classification,
      checklist,
      requiredDocuments: checklist.filter(c => !c.received),
      nextSteps: this._getNextSteps(kycStatus, sanctionsResult, riskScore)
    };
  }

  /**
   * KYC document verification
   */
  _evaluateKycDocuments(investor, checklist) {
    const received = checklist.filter(c => c.received).length;
    const total = checklist.length;

    return {
      completionPct: parseFloat(((received / total) * 100).toFixed(1)),
      documentsReceived: received,
      documentsRequired: total,
      outstanding: checklist.filter(c => !c.received).map(c => c.name),
      expired: checklist.filter(c => c.received && c.expiryDate && new Date(c.expiryDate) < new Date())
        .map(c => ({ name: c.name, expiredOn: c.expiryDate })),
      complete: received === total
    };
  }

  /**
   * Sanctions & watchlist screening
   */
  async screenSanctions(investor) {
    // In production, call OFAC, EU, UN screening APIs
    const listsToScreen = [
      'OFAC_SDN', 'OFAC_NON_SDN', 'EU_CONSOLIDATED', 'UN_SANCTIONS',
      'UK_HMT', 'AUSTRALIA_DFAT', 'CANADA_OSFI'
    ];

    const beneficialOwners = investor.beneficialOwners || [];
    const entitiesToScreen = [
      { name: investor.name, type: 'ENTITY' },
      ...beneficialOwners.map(bo => ({ name: bo.name, type: 'INDIVIDUAL', dob: bo.dob }))
    ];

    return {
      screenedEntities: entitiesToScreen.length,
      listsScreened: listsToScreen,
      screenedAt: new Date().toISOString(),
      hits: [], // Would contain actual matches
      status: 'CLEAR', // CLEAR, POTENTIAL_MATCH, CONFIRMED_MATCH
      pepStatus: this._screenPep(investor),
      adverseMedia: { screened: true, hits: 0 },
      nextScreeningDue: this._nextScreeningDate()
    };
  }

  /**
   * Classify investor for tax and regulatory purposes
   */
  classifyInvestor(investor) {
    return {
      investorType: investor.entityType,
      investorCategory: this._categorize(investor),
      fatcaClassification: this._fatcaClassify(investor),
      crsClassification: this._crsClassify(investor),
      erisaStatus: investor.isBenefitPlan ? 'BENEFIT_PLAN_INVESTOR' : 'NON_ERISA',
      qualifiedPurchaser: investor.investableAssets >= 5000000,
      accreditedInvestor: this._isAccredited(investor),
      qualifiedClient: investor.netWorth >= 2200000 || investor.aum >= 1100000,
      knowledgeableEmployee: investor.isKnowledgeableEmployee || false,
      foiaSubject: investor.isGovernmental || false,
      taxExempt: investor.isTaxExempt || false,
      usePerson: investor.jurisdiction === 'US' || investor.usCitizen,
      requiresBlocker: investor.isTaxExempt || (investor.jurisdiction !== 'US' && !investor.usCitizen),
      taxForms: this._requiredTaxForms(investor)
    };
  }

  /**
   * Monitor ERISA 25% benefit plan investor test
   */
  monitorErisaTest(fund) {
    const benefitPlanCapital = fund.investors
      .filter(lp => lp.isBenefitPlan)
      .reduce((sum, lp) => sum + lp.capitalAccount, 0);

    // Exclude GP commit and knowledgeable employees from denominator
    const gpAndEmployeeCapital = fund.investors
      .filter(lp => lp.isGp || lp.isKnowledgeableEmployee)
      .reduce((sum, lp) => sum + lp.capitalAccount, 0);

    const testDenominator = fund.totalCapital - gpAndEmployeeCapital;
    const bpiPercentage = benefitPlanCapital / testDenominator;

    return {
      totalFundCapital: fund.totalCapital,
      benefitPlanCapital,
      gpAndEmployeeExcluded: gpAndEmployeeCapital,
      testDenominator,
      bpiPercentage: parseFloat((bpiPercentage * 100).toFixed(2)),
      threshold: 25,
      passesTest: bpiPercentage < 0.25,
      headroom: parseFloat(((0.25 - bpiPercentage) * testDenominator).toFixed(2)),
      warning: bpiPercentage > 0.20
        ? 'APPROACHING ERISA THRESHOLD — within 5% of 25% limit'
        : null,
      implication: bpiPercentage >= 0.25
        ? 'FUND IS SUBJECT TO ERISA — fiduciary obligations and prohibited transaction rules apply'
        : 'Fund is not subject to ERISA'
    };
  }

  /**
   * Subscription document checklist by entity type
   */
  _getChecklistForType(entityType) {
    const base = [
      { name: 'Subscription Agreement', category: 'legal', received: false },
      { name: 'Investor Questionnaire', category: 'kyc', received: false },
      { name: 'Anti-Money Laundering Form', category: 'aml', received: false },
      { name: 'Source of Funds Declaration', category: 'aml', received: false },
      { name: 'Bank Account Details', category: 'banking', received: false }
    ];

    const typeSpecific = {
      INDIVIDUAL: [
        { name: 'Government-Issued ID (Passport/DL)', category: 'kyc', received: false },
        { name: 'Proof of Address (utility bill < 3 months)', category: 'kyc', received: false },
        { name: 'Accredited Investor Verification Letter', category: 'regulatory', received: false },
        { name: 'W-9 or W-8BEN', category: 'tax', received: false }
      ],
      CORPORATION: [
        { name: 'Certificate of Incorporation', category: 'kyc', received: false },
        { name: 'Articles of Association / Bylaws', category: 'kyc', received: false },
        { name: 'Board Resolution Authorizing Investment', category: 'legal', received: false },
        { name: 'Beneficial Ownership Declaration (25%+ owners)', category: 'kyc', received: false },
        { name: 'ID of Authorized Signatories', category: 'kyc', received: false },
        { name: 'W-8BEN-E', category: 'tax', received: false }
      ],
      PARTNERSHIP: [
        { name: 'Partnership Agreement', category: 'kyc', received: false },
        { name: 'Certificate of Limited Partnership', category: 'kyc', received: false },
        { name: 'Partner Authorization', category: 'legal', received: false },
        { name: 'Beneficial Ownership Declaration', category: 'kyc', received: false },
        { name: 'W-8IMY (if foreign partnership)', category: 'tax', received: false }
      ],
      TRUST: [
        { name: 'Trust Deed / Agreement', category: 'kyc', received: false },
        { name: 'Certificate of Trust', category: 'kyc', received: false },
        { name: 'ID of Trustees', category: 'kyc', received: false },
        { name: 'ID of Settlor and Beneficiaries', category: 'kyc', received: false },
        { name: 'Letter of Authority', category: 'legal', received: false }
      ],
      SOVEREIGN_WEALTH: [
        { name: 'Constitutive Documents', category: 'kyc', received: false },
        { name: 'Authorization from Governing Body', category: 'legal', received: false },
        { name: 'Authorized Representative ID', category: 'kyc', received: false },
        { name: 'Sovereign Immunity Waiver', category: 'legal', received: false }
      ],
      FUND_OF_FUNDS: [
        { name: 'Fund Offering Documents', category: 'kyc', received: false },
        { name: 'Most Recent Audited Financials', category: 'kyc', received: false },
        { name: 'AML/KYC Policy', category: 'aml', received: false },
        { name: 'Look-Through Representations', category: 'regulatory', received: false },
        { name: 'W-8IMY with Withholding Allocations', category: 'tax', received: false }
      ]
    };

    return [...base, ...(typeSpecific[entityType] || typeSpecific.CORPORATION)];
  }

  /**
   * Get jurisdiction-specific onboarding requirements
   */
  getJurisdictionOnboardingRequirements(jurisdiction) {
    const requirements = {

      // --- Americas & Offshore ---
      US: {
        regulator: 'SEC / FinCEN',
        kycStandard: 'CDD Rule (FinCEN)', boThreshold: '25%',
        additionalDocs: ['OFAC SDN screening', 'FinCEN BOI Report (if applicable)', 'Form CRS delivery'],
        taxForms: ['W-9'],
        accreditationRequired: true, accreditationStandard: 'Regulation D (Rule 501)',
        qualifiedPurchaserThreshold: 5000000,
        amlLegislation: 'Bank Secrecy Act / USA PATRIOT Act'
      },
      CAYMAN: {
        regulator: 'CIMA',
        kycStandard: 'AML Regulations (2020 Revision)', boThreshold: '25%',
        additionalDocs: ['CIMA AML compliance', 'Source of wealth declaration', 'Tax Information Authority reporting'],
        taxForms: ['Self-certification (CRS/FATCA)'],
        accreditationRequired: false,
        amlLegislation: 'Proceeds of Crime Act / AML Regulations'
      },
      BVI: {
        regulator: 'BVI FSC',
        kycStandard: 'AML/CFT Code of Practice', boThreshold: '25%',
        additionalDocs: ['BOSS beneficial ownership filing', 'Professional investor certificate', 'AML compliance officer declaration'],
        taxForms: ['Self-certification (CRS/FATCA)'],
        accreditationRequired: true, accreditationStandard: 'Professional Investor (net assets >$1M)',
        amlLegislation: 'AML & Terrorist Financing Code of Practice'
      },
      GUERNSEY: {
        regulator: 'GFSC',
        kycStandard: 'Handbook on Countering Financial Crime', boThreshold: '25%',
        additionalDocs: ['Beneficial ownership declaration', 'Source of funds evidence', 'Risk assessment'],
        taxForms: ['Self-certification (CRS/FATCA)'],
        accreditationRequired: true, accreditationStandard: 'Qualifying investor (net assets >£1M or income >£100K)',
        amlLegislation: 'Disclosure Law / POI Law / AML Handbook'
      },
      JERSEY: {
        regulator: 'JFSC',
        kycStandard: 'AML/CFT/CPF Handbook', boThreshold: '25%',
        additionalDocs: ['Beneficial ownership filing', 'Business risk assessment', 'Source of funds declaration'],
        taxForms: ['Self-certification (CRS/FATCA)'],
        accreditationRequired: true, accreditationStandard: 'Professional / eligible investor',
        amlLegislation: 'Proceeds of Crime (Jersey) Law / MLO'
      },

      // --- Middle East ---
      ADGM: {
        regulator: 'FSRA',
        kycStandard: 'FSRA AML Rulebook', boThreshold: '25%',
        additionalDocs: ['UAE national ID (Emirates ID)', 'Professional client classification', 'Source of wealth statement'],
        taxForms: ['Self-certification (CRS/FATCA)', 'UAE CT registration (if applicable)'],
        accreditationRequired: true, accreditationStandard: 'Professional Client (net assets >$500K)',
        amlLegislation: 'Federal AML Law / FSRA AML Rules'
      },
      DIFC: {
        regulator: 'DFSA',
        kycStandard: 'DFSA AML Module (AML)', boThreshold: '25%',
        additionalDocs: ['Emirates ID', 'Professional client declaration', 'Source of wealth evidence'],
        taxForms: ['Self-certification (CRS/FATCA)', 'UAE CT registration (if applicable)'],
        accreditationRequired: true, accreditationStandard: 'Professional Client (net assets >$500K)',
        amlLegislation: 'Federal AML Law / DFSA AML Module'
      },

      // --- Asia-Pacific ---
      HONG_KONG: {
        regulator: 'SFC',
        kycStandard: 'AMLO Guidelines', boThreshold: '25%',
        additionalDocs: ['HKID or passport', 'Professional investor declaration', 'SFC licensing check'],
        taxForms: ['Self-certification (CRS/FATCA)', 'IRD tax return (if HK-sourced income)'],
        accreditationRequired: true, accreditationStandard: 'Professional Investor (portfolio >HK$8M)',
        amlLegislation: 'Anti-Money Laundering and Counter-Terrorist Financing Ordinance (AMLO)'
      },
      SINGAPORE: {
        regulator: 'MAS',
        kycStandard: 'MAS Notice 626 / SFA Guidelines', boThreshold: '25%',
        additionalDocs: ['NRIC or passport', 'Accredited/institutional investor declaration', 'MAS-compliant risk assessment'],
        taxForms: ['Self-certification (CRS/FATCA)', 'IRAS Form IR8A (if applicable)'],
        accreditationRequired: true, accreditationStandard: 'Accredited Investor (net assets >S$2M or income >S$300K)',
        amlLegislation: 'Corruption, Drug Trafficking and Other Serious Crimes Act (CDSA)'
      },

      // --- UK ---
      UK: {
        regulator: 'FCA',
        kycStandard: 'FCA Money Laundering Regulations 2017', boThreshold: '25%',
        additionalDocs: ['FCA categorisation (professional/retail)', 'Investor certification', 'Source of wealth evidence'],
        taxForms: ['Self-certification (CRS/FATCA)', 'HMRC SA registration (if applicable)'],
        accreditationRequired: true, accreditationStandard: 'Professional investor / High Net Worth / Sophisticated',
        amlLegislation: 'Money Laundering Regulations 2017 / Proceeds of Crime Act 2002'
      },

      // --- EU Member States ---
      LUXEMBOURG: {
        regulator: 'CSSF',
        kycStandard: 'CSSF AML/CFT Regulation 12-02', boThreshold: '25%',
        additionalDocs: ['CSSF authorisation confirmation', 'RBE beneficial ownership filing', 'Well-informed investor declaration'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Subscription tax declaration'],
        accreditationRequired: true, accreditationStandard: 'Well-informed investor (>€125K commitment or professional certification)',
        amlLegislation: 'AML/CFT Law of 12 November 2004 (as amended)'
      },
      IRELAND: {
        regulator: 'CBI (Central Bank of Ireland)',
        kycStandard: 'CBI AML Guidelines', boThreshold: '25%',
        additionalDocs: ['Qualifying investor declaration (>€100K min)', 'CBI-prescribed AML documentation', 'Irish PPS number (if tax-resident)'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Revenue declaration of tax residence'],
        accreditationRequired: true, accreditationStandard: 'Qualifying Investor (min €100K commitment)',
        amlLegislation: 'Criminal Justice (Money Laundering and Terrorist Financing) Act 2010'
      },
      FRANCE: {
        regulator: 'AMF',
        kycStandard: 'AMF Position DOC-2019-03', boThreshold: '25%',
        additionalDocs: ['AMF categorisation (professional/non-professional)', 'RBE beneficial ownership filing', 'Attestation de conformité LCB-FT'],
        taxForms: ['Self-certification (CRS/FATCA)', 'DGFiP tax residency certificate'],
        accreditationRequired: true, accreditationStandard: 'Professional investor (MiFID II) or qualified (min €100K)',
        amlLegislation: 'Code monétaire et financier (CMF) / Tracfin reporting'
      },
      GERMANY: {
        regulator: 'BaFin',
        kycStandard: 'GwG (Geldwäschegesetz)', boThreshold: '25%',
        additionalDocs: ['BaFin registration confirmation', 'Transparenzregister (transparency register) filing', 'Professional investor classification'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Ansässigkeitsbescheinigung (tax residency certificate)'],
        accreditationRequired: true, accreditationStandard: 'Semi-professional (>€200K) or Professional (MiFID II)',
        amlLegislation: 'Geldwäschegesetz (GwG) — Money Laundering Act'
      },
      NETHERLANDS: {
        regulator: 'AFM / DNB',
        kycStandard: 'Wwft (Wet ter voorkoming van witwassen)', boThreshold: '25%',
        additionalDocs: ['KVK (Chamber of Commerce) extract', 'UBO register filing', 'Professional investor declaration'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Tax residency certificate'],
        accreditationRequired: true, accreditationStandard: 'Professional investor (MiFID II)',
        amlLegislation: 'Wwft (Anti-Money Laundering and Terrorist Financing Act)'
      },
      ITALY: {
        regulator: 'CONSOB / Banca d\'Italia',
        kycStandard: 'D.Lgs. 231/2007 (AML Decree)', boThreshold: '25%',
        additionalDocs: ['Visura camerale (company registry extract)', 'Professional investor self-declaration', 'Beneficial ownership declaration (titolare effettivo)'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Codice fiscale', 'Certificato di residenza fiscale'],
        accreditationRequired: true, accreditationStandard: 'Professional investor (Consob/MiFID II) or reserved AIF (>€500K)',
        amlLegislation: 'D.Lgs. 231/2007 (Legislative Decree 231)'
      },
      SPAIN: {
        regulator: 'CNMV',
        kycStandard: 'Ley 10/2010 (AML Law)', boThreshold: '25%',
        additionalDocs: ['NIF/CIF (tax ID)', 'Registro Mercantil extract', 'Professional investor classification'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Certificado de residencia fiscal (AEAT)'],
        accreditationRequired: true, accreditationStandard: 'Professional investor (CNMV/MiFID II) or qualified (>€100K)',
        amlLegislation: 'Ley 10/2010 de prevención del blanqueo de capitales'
      },

      // --- Nordics ---
      DENMARK: {
        regulator: 'DFSA (Finanstilsynet)',
        kycStandard: 'Hvidvaskloven (AML Act)', boThreshold: '25%',
        additionalDocs: ['CVR number (company registry)', 'Professional investor declaration', 'Beneficial ownership filing'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Danish tax residency certificate'],
        accreditationRequired: true, accreditationStandard: 'Professional investor (MiFID II)',
        amlLegislation: 'Hvidvaskloven (Danish AML Act)'
      },
      SWEDEN: {
        regulator: 'FI (Finansinspektionen)',
        kycStandard: 'Penningtvättslagen (AML Act)', boThreshold: '25%',
        additionalDocs: ['Organisationsnummer (company number)', 'Professional investor declaration', 'Beneficial ownership filing (Bolagsverket)'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Swedish tax residency certificate'],
        accreditationRequired: true, accreditationStandard: 'Professional investor (MiFID II)',
        amlLegislation: 'Penningtvättslagen (2017:630)'
      },
      NORWAY: {
        regulator: 'Finanstilsynet',
        kycStandard: 'Hvitvaskingsloven (AML Act)', boThreshold: '25%',
        additionalDocs: ['Organisasjonsnummer (company number)', 'Professional investor declaration', 'Beneficial ownership filing (Brønnøysund)'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Skatteattest (Norwegian tax certificate)'],
        accreditationRequired: true, accreditationStandard: 'Professional investor (MiFID II / AIF Act)',
        amlLegislation: 'Hvitvaskingsloven (Norwegian AML Act)'
      },
      FINLAND: {
        regulator: 'FIN-FSA',
        kycStandard: 'Rahanpesulaki (AML Act)', boThreshold: '25%',
        additionalDocs: ['Y-tunnus (business ID)', 'Professional investor declaration', 'Beneficial ownership filing (PRH register)'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Finnish tax residency certificate'],
        accreditationRequired: true, accreditationStandard: 'Professional investor (MiFID II)',
        amlLegislation: 'Rahanpesulaki (444/2017)'
      },

      // --- Baltics ---
      ESTONIA: {
        regulator: 'EFSA (Finantsinspektsioon)',
        kycStandard: 'Rahapesu tõkestamise seadus (AML Act)', boThreshold: '25%',
        additionalDocs: ['Registrikood (registry code)', 'Professional investor declaration', 'e-Residency digital ID (if applicable)'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Estonian tax residency certificate'],
        accreditationRequired: true, accreditationStandard: 'Professional investor (MiFID II)',
        amlLegislation: 'Rahapesu ja terrorismi rahastamise tõkestamise seadus'
      },
      LITHUANIA: {
        regulator: 'LB (Lietuvos Bankas)',
        kycStandard: 'LB AML/CFT Guidelines', boThreshold: '25%',
        additionalDocs: ['JAR code (company registry)', 'Professional investor declaration', 'Beneficial ownership declaration'],
        taxForms: ['Self-certification (CRS/FATCA)', 'Lithuanian tax residency certificate'],
        accreditationRequired: true, accreditationStandard: 'Professional investor (MiFID II)',
        amlLegislation: 'Pinigų plovimo prevencijos įstatymas'
      },

      // --- Switzerland ---
      SWITZERLAND: {
        regulator: 'FINMA',
        kycStandard: 'AMLA (GwG) / FINMA AML Ordinance', boThreshold: '25%',
        additionalDocs: ['Handelsregisterauszug (commercial register)', 'Qualified investor declaration (CISA)', 'Form A/T (AML identification)', 'AMAS due diligence'],
        taxForms: ['Self-certification (CRS/FATCA)', 'DA-1 withholding tax reclaim (if applicable)'],
        accreditationRequired: true, accreditationStandard: 'Qualified Investor (CISA Art. 10) — professional client or HNW with opt-in',
        amlLegislation: 'AMLA (GwG — Geldwäschereigesetz) / FINMA AML Ordinance'
      }
    };

    return requirements[jurisdiction] || null;
  }

  /**
   * Get all jurisdiction onboarding requirements
   */
  getAllOnboardingRequirements() {
    const jurisdictions = [
      'US', 'CAYMAN', 'BVI', 'GUERNSEY', 'JERSEY', 'ADGM', 'DIFC',
      'HONG_KONG', 'SINGAPORE', 'UK', 'LUXEMBOURG', 'IRELAND', 'FRANCE',
      'GERMANY', 'NETHERLANDS', 'ITALY', 'SPAIN', 'DENMARK', 'SWEDEN',
      'NORWAY', 'FINLAND', 'ESTONIA', 'LITHUANIA', 'SWITZERLAND'
    ];
    const reqs = {};
    for (const j of jurisdictions) {
      reqs[j] = this.getJurisdictionOnboardingRequirements(j);
    }
    return reqs;
  }

  _calculateRiskScore(investor) {
    let score = 0;
    // FATF high-risk & sanctioned jurisdictions
    const highRiskCountries = ['IR', 'KP', 'SY', 'CU', 'VE', 'MM', 'RU', 'BY', 'SO', 'YE', 'LY', 'SD'];
    // FATF increased monitoring + elevated risk
    const elevatedRiskCountries = ['CN', 'AE', 'NG', 'PK', 'AF', 'TR', 'TZ', 'KE', 'PH', 'VN', 'JO', 'ML', 'BF', 'CM', 'CD', 'HT', 'MZ', 'SS', 'ZA'];

    if (highRiskCountries.includes(investor.jurisdiction)) score += 40;
    else if (elevatedRiskCountries.includes(investor.jurisdiction)) score += 20;

    if (investor.isPep) score += 25;
    if (investor.entityType === 'TRUST') score += 10;
    if (investor.isBearer) score += 30;
    if (!investor.beneficialOwners?.length) score += 15;
    if (investor.sourceOfFunds === 'UNKNOWN') score += 20;
    if (investor.complexStructure) score += 15; // Multi-layered or nominee structures

    return Math.min(score, 100);
  }

  _screenPep(investor) {
    return {
      isPep: investor.isPep || false,
      pepType: investor.pepType || null, // DOMESTIC, FOREIGN, IO (international org)
      pepRelationship: investor.pepRelationship || null, // DIRECT, FAMILY, CLOSE_ASSOCIATE
      enhancedDueDiligence: investor.isPep
    };
  }

  _categorize(investor) {
    const categories = {
      'PENSION': 'Institutional — Pension Fund',
      'ENDOWMENT': 'Institutional — Endowment/Foundation',
      'SOVEREIGN_WEALTH': 'Institutional — Sovereign Wealth Fund',
      'INSURANCE': 'Institutional — Insurance Company',
      'FUND_OF_FUNDS': 'Institutional — Fund of Funds',
      'FAMILY_OFFICE': 'Family Office',
      'CORPORATION': 'Corporate',
      'INDIVIDUAL': 'Individual / HNW',
      'TRUST': 'Trust',
      'PARTNERSHIP': 'Partnership'
    };
    return categories[investor.entityType] || 'Other';
  }

  _fatcaClassify(investor) {
    if (investor.jurisdiction === 'US' || investor.usCitizen) return 'US_PERSON';
    if (investor.usOwnershipPct >= 10) return 'US_OWNED_FOREIGN_ENTITY';
    return 'NON_US';
  }

  _crsClassify(investor) {
    if (investor.isFinancialInstitution) return 'FINANCIAL_INSTITUTION';
    if (investor.isActiveNfe) return 'ACTIVE_NFE';
    return 'PASSIVE_NFE';
  }

  _isAccredited(investor) {
    if (investor.entityType === 'INDIVIDUAL') {
      return investor.netWorth >= 1000000 || investor.annualIncome >= 200000;
    }
    return investor.totalAssets >= 5000000;
  }

  _requiredTaxForms(investor) {
    const forms = [];
    if (investor.jurisdiction === 'US') forms.push('W-9');
    else {
      if (investor.entityType === 'INDIVIDUAL') forms.push('W-8BEN');
      else if (investor.entityType === 'PARTNERSHIP' || investor.entityType === 'FUND_OF_FUNDS') forms.push('W-8IMY');
      else forms.push('W-8BEN-E');
    }
    if (investor.claimsEciExemption) forms.push('W-8ECI');
    return forms;
  }

  _nextScreeningDate() {
    const date = new Date();
    date.setMonth(date.getMonth() + 6); // Re-screen every 6 months
    return date.toISOString().split('T')[0];
  }

  _determineStatus(kyc, sanctions, riskScore) {
    if (sanctions.status === 'CONFIRMED_MATCH') return 'REJECTED';
    if (sanctions.status === 'POTENTIAL_MATCH') return 'UNDER_REVIEW';
    if (riskScore > 70) return 'ENHANCED_DUE_DILIGENCE';
    if (!kyc.complete) return 'DOCUMENTS_PENDING';
    return 'APPROVED';
  }

  _getNextSteps(kyc, sanctions, riskScore) {
    const steps = [];
    if (!kyc.complete) steps.push(`Collect ${kyc.documentsRequired - kyc.documentsReceived} outstanding documents`);
    if (kyc.expired?.length) steps.push(`Refresh ${kyc.expired.length} expired documents`);
    if (sanctions.status === 'POTENTIAL_MATCH') steps.push('Manual review of sanctions screening hit');
    if (riskScore > 70) steps.push('Complete enhanced due diligence review');
    if (riskScore > 40) steps.push('Senior compliance officer sign-off required');
    if (steps.length === 0) steps.push('Ready for subscription acceptance');
    return steps;
  }
}

module.exports = new InvestorOnboardingService();
