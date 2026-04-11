/**
 * Secondary Market / LP Transfer Service
 * Interest transfers, ROFR management, transfer pricing,
 * consent tracking, documentation workflow.
 */

class SecondaryMarketService {

  /**
   * Initiate an LP interest transfer request
   */
  initiateTransfer({ seller, buyer, fund, transferAmount, transferPrice }) {
    const nav = seller.capitalAccount;
    const discountPremium = transferPrice / nav;

    return {
      transferId: `XFER-${Date.now()}`,
      seller: {
        id: seller.id,
        name: seller.name,
        currentCapitalAccount: nav,
        commitment: seller.commitment,
        unfundedCommitment: seller.unfundedCommitment
      },
      buyer: {
        id: buyer.id,
        name: buyer.name,
        entityType: buyer.entityType,
        existingLp: buyer.existingLp || false
      },
      transferDetails: {
        interestBeingTransferred: transferAmount,
        pctOfSellerInterest: parseFloat(((transferAmount / nav) * 100).toFixed(2)) + '%',
        purchasePrice: transferPrice,
        priceToNav: parseFloat((discountPremium * 100).toFixed(2)) + '%',
        discount: discountPremium < 1
          ? parseFloat(((1 - discountPremium) * 100).toFixed(2)) + '% discount'
          : parseFloat(((discountPremium - 1) * 100).toFixed(2)) + '% premium',
        unfundedCommitmentTransferred: parseFloat((seller.unfundedCommitment * (transferAmount / nav)).toFixed(2))
      },
      approvals: {
        gpConsent: { required: true, status: 'PENDING', approver: null },
        lpacConsent: { required: false, status: 'NOT_REQUIRED' },
        rofrProcess: { required: true, status: 'NOT_STARTED' },
        regulatoryApproval: { required: buyer.requiresRegApproval || false, status: buyer.requiresRegApproval ? 'PENDING' : 'NOT_REQUIRED' }
      },
      kycRequired: !buyer.existingLp,
      timeline: {
        requestDate: new Date().toISOString().split('T')[0],
        rofrNoticeDate: null,
        rofrExpiryDate: null,
        expectedClosing: null
      },
      status: 'INITIATED'
    };
  }

  /**
   * Process Right of First Refusal (ROFR)
   */
  processRofr({ transfer, eligibleLps, rofrPeriodDays = 30 }) {
    const rofrNoticeDate = new Date();
    const rofrExpiryDate = new Date();
    rofrExpiryDate.setDate(rofrExpiryDate.getDate() + rofrPeriodDays);

    return {
      transferId: transfer.transferId,
      rofrNotice: {
        issueDate: rofrNoticeDate.toISOString().split('T')[0],
        expiryDate: rofrExpiryDate.toISOString().split('T')[0],
        periodDays: rofrPeriodDays,
        interestOffered: transfer.transferDetails.interestBeingTransferred,
        price: transfer.transferDetails.purchasePrice,
        terms: 'Same terms as proposed transfer'
      },
      notifiedLps: eligibleLps.map(lp => ({
        investorId: lp.id,
        investorName: lp.name,
        commitment: lp.commitment,
        proRataEntitlement: parseFloat((transfer.transferDetails.interestBeingTransferred * (lp.commitment / eligibleLps.reduce((s, l) => s + l.commitment, 0))).toFixed(2)),
        responseStatus: 'PENDING',
        electedAmount: null
      })),
      possibleOutcomes: [
        'Full exercise — one or more existing LPs take entire interest at offered terms',
        'Partial exercise — existing LPs take portion, remainder goes to buyer',
        'Waiver — no existing LPs exercise ROFR, transfer proceeds to buyer',
        'Expiry — ROFR period expires without response, deemed waived'
      ],
      status: 'ROFR_PERIOD_ACTIVE'
    };
  }

  /**
   * Calculate transfer pricing guidance
   */
  calculateTransferPricing({ fund, seller, marketConditions }) {
    const nav = seller.capitalAccount;
    const fundAge = (new Date() - new Date(fund.inceptionDate)) / (365.25 * 24 * 60 * 60 * 1000);
    const jCurvePosition = fundAge < 3 ? 'EARLY' : fundAge < 6 ? 'MID' : 'MATURE';

    // Market discount ranges by fund stage
    const discountRanges = {
      EARLY: { min: 0.70, typical: 0.80, max: 0.90 },
      MID: { min: 0.85, typical: 0.92, max: 1.00 },
      MATURE: { min: 0.90, typical: 0.97, max: 1.05 }
    };

    const range = discountRanges[jCurvePosition];

    // Adjust for fund quality
    let qualityAdj = 0;
    if (fund.netIrr > 0.20) qualityAdj = 0.05;
    else if (fund.netIrr > 0.15) qualityAdj = 0.03;
    else if (fund.netIrr < 0.05) qualityAdj = -0.05;

    // Adjust for market conditions
    const marketAdj = marketConditions?.spread || 0;

    return {
      seller: seller.name,
      currentNav: nav,
      fundAge: parseFloat(fundAge.toFixed(1)) + ' years',
      jCurvePosition,
      fundIrr: fund.netIrr,
      tvpi: fund.tvpi,
      dpi: fund.dpi,
      unfundedPctOfCommitment: parseFloat(((seller.unfundedCommitment / seller.commitment) * 100).toFixed(1)) + '%',
      pricingGuidance: {
        lowEstimate: parseFloat((nav * (range.min + qualityAdj + marketAdj)).toFixed(2)),
        midEstimate: parseFloat((nav * (range.typical + qualityAdj + marketAdj)).toFixed(2)),
        highEstimate: parseFloat((nav * (range.max + qualityAdj + marketAdj)).toFixed(2)),
        asPercentOfNav: {
          low: parseFloat(((range.min + qualityAdj + marketAdj) * 100).toFixed(1)) + '%',
          mid: parseFloat(((range.typical + qualityAdj + marketAdj) * 100).toFixed(1)) + '%',
          high: parseFloat(((range.max + qualityAdj + marketAdj) * 100).toFixed(1)) + '%'
        }
      },
      factors: {
        jCurveAdjustment: jCurvePosition,
        qualityAdjustment: (qualityAdj * 100).toFixed(1) + '%',
        marketAdjustment: (marketAdj * 100).toFixed(1) + '%'
      },
      considerations: [
        'Unfunded commitment obligation transfers to buyer — impacts pricing',
        'Fund distribution timeline affects buyer liquidity and IRR',
        `Fund is ${jCurvePosition.toLowerCase()} in lifecycle — ${jCurvePosition === 'EARLY' ? 'higher discount expected' : 'closer to NAV expected'}`,
        fund.dpi > 0.5 ? 'Significant capital already returned — lower risk for buyer' : 'Limited distributions to date — buyer takes J-curve risk'
      ]
    };
  }

  /**
   * Generate transfer documentation checklist
   */
  generateDocChecklist(transfer) {
    return {
      transferId: transfer.transferId,
      documents: [
        { name: 'Transfer Agreement (Purchase & Sale)', status: 'REQUIRED', responsible: 'Seller counsel' },
        { name: 'GP Consent Letter', status: 'REQUIRED', responsible: 'Fund counsel' },
        { name: 'ROFR Waiver / Exercise Notices', status: 'REQUIRED', responsible: 'Fund counsel' },
        { name: 'Amended Schedule of Partners', status: 'REQUIRED', responsible: 'Fund administrator' },
        { name: 'Buyer KYC/AML Documents', status: transfer.kycRequired ? 'REQUIRED' : 'NOT_REQUIRED', responsible: 'Buyer' },
        { name: 'Buyer Subscription Agreement', status: 'REQUIRED', responsible: 'Buyer' },
        { name: 'Buyer Side Letter (if applicable)', status: 'OPTIONAL', responsible: 'Fund counsel' },
        { name: 'Tax Withholding Certificates (W-8/W-9)', status: 'REQUIRED', responsible: 'Buyer' },
        { name: 'Opinion Letter (enforceability)', status: 'RECOMMENDED', responsible: 'Buyer counsel' },
        { name: 'ERISA Representations', status: transfer.buyer?.isBenefitPlan ? 'REQUIRED' : 'OPTIONAL', responsible: 'Buyer' },
        { name: 'Section 754 Election Notice', status: 'RECOMMENDED', responsible: 'Fund tax advisor' },
        { name: 'Wire Instructions (buyer & seller)', status: 'REQUIRED', responsible: 'Both parties' }
      ]
    };
  }
}

module.exports = new SecondaryMarketService();
