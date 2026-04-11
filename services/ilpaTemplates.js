/**
 * ILPA Template Generator
 * Standardized ILPA templates for capital calls, distributions,
 * quarterly reports, fee disclosures, DDQ.
 */

class IlpaTemplateService {

  /**
   * ILPA-standard capital call notice
   */
  generateCapitalCallTemplate({ fund, callDetails, investors }) {
    return {
      template: 'ILPA_CAPITAL_CALL',
      version: '2.0',
      header: {
        fundName: fund.name,
        gpName: fund.gpName,
        noticeDate: callDetails.noticeDate,
        drawdownDate: callDetails.dueDate,
        callNumber: callDetails.callNumber
      },
      callSummary: {
        totalCallAmount: callDetails.totalAmount,
        purpose: callDetails.purpose, // INVESTMENT, EXPENSES, MANAGEMENT_FEE, RECYCLED
        investmentName: callDetails.investmentName || null,
        investmentDescription: callDetails.investmentDescription || null
      },
      investorDetails: investors.map(lp => ({
        investorName: lp.name,
        commitment: lp.commitment,
        priorContributions: lp.totalCalled,
        thisCallAmount: lp.callAmount,
        totalContributionsAfterCall: lp.totalCalled + lp.callAmount,
        remainingUnfunded: lp.commitment - lp.totalCalled - lp.callAmount,
        pctCalled: parseFloat((((lp.totalCalled + lp.callAmount) / lp.commitment) * 100).toFixed(2)) + '%'
      })),
      callBreakdown: {
        investmentCapital: callDetails.investmentAmount || 0,
        managementFees: callDetails.managementFeeAmount || 0,
        organizationalExpenses: callDetails.orgExpenses || 0,
        partnershipExpenses: callDetails.fundExpenses || 0,
        total: callDetails.totalAmount
      },
      wireInstructions: fund.wireInstructions,
      importantDates: {
        noticeDate: callDetails.noticeDate,
        paymentDueDate: callDetails.dueDate,
        defaultDate: callDetails.defaultDate
      }
    };
  }

  /**
   * ILPA-standard distribution notice
   */
  generateDistributionTemplate({ fund, distDetails, investors }) {
    return {
      template: 'ILPA_DISTRIBUTION',
      version: '2.0',
      header: {
        fundName: fund.name,
        gpName: fund.gpName,
        noticeDate: distDetails.noticeDate,
        distributionDate: distDetails.distributionDate,
        distributionNumber: distDetails.distributionNumber
      },
      distributionSummary: {
        totalDistribution: distDetails.totalAmount,
        source: distDetails.source, // REALIZATION, DIVIDEND_RECAP, RECALLABLE, RETURN_OF_CAPITAL
        investmentName: distDetails.investmentName || null,
        realizedMultiple: distDetails.realizedMultiple || null
      },
      investorDetails: investors.map(lp => ({
        investorName: lp.name,
        commitment: lp.commitment,
        totalContributions: lp.totalCalled,
        priorDistributions: lp.priorDistributions,
        thisDistribution: {
          returnOfCapital: lp.returnOfCapital || 0,
          preferredReturn: lp.preferredReturn || 0,
          profit: lp.profit || 0,
          grossDistribution: lp.grossAmount,
          withholdingTax: lp.withholdingTax || 0,
          netDistribution: lp.grossAmount - (lp.withholdingTax || 0)
        },
        cumulativeDistributions: lp.priorDistributions + lp.grossAmount,
        dpi: parseFloat(((lp.priorDistributions + lp.grossAmount) / lp.totalCalled).toFixed(4)),
        recallable: lp.recallableAmount || 0
      })),
      waterfallSummary: distDetails.waterfall || null
    };
  }

  /**
   * ILPA-standard quarterly report template
   */
  generateQuarterlyTemplate({ fund, period, performance, portfolio, capitalAccount }) {
    return {
      template: 'ILPA_QUARTERLY_REPORT',
      version: '2.0',
      header: {
        fundName: fund.name,
        gpName: fund.gpName,
        reportingPeriod: period,
        reportDate: new Date().toISOString().split('T')[0]
      },
      fundSummary: {
        vintage: fund.vintageYear,
        strategy: fund.strategy,
        fundSize: fund.totalCommitments,
        investmentPeriodEnd: fund.investmentPeriodEnd,
        fundTermEnd: fund.termEnd
      },
      performanceMetrics: {
        grossIrr: performance.grossIrr,
        netIrr: performance.netIrr,
        grossTvpi: performance.grossTvpi,
        netTvpi: performance.netTvpi,
        dpi: performance.dpi,
        rvpi: performance.rvpi,
        paidInCapitalPct: parseFloat(((performance.paidInCapital / fund.totalCommitments) * 100).toFixed(1)) + '%'
      },
      capitalActivity: {
        contributionsDuringPeriod: capitalAccount.periodContributions,
        distributionsDuringPeriod: capitalAccount.periodDistributions,
        cumulativeContributions: capitalAccount.totalContributions,
        cumulativeDistributions: capitalAccount.totalDistributions,
        unfundedCommitments: fund.totalCommitments - capitalAccount.totalContributions,
        nav: capitalAccount.nav,
        totalValue: capitalAccount.totalDistributions + capitalAccount.nav
      },
      portfolioSummary: portfolio.companies.map(co => ({
        companyName: co.name,
        sector: co.sector,
        geography: co.geography,
        investmentDate: co.investmentDate,
        costBasis: co.costBasis,
        fairValue: co.fairValue,
        realizedProceeds: co.realizedProceeds || 0,
        totalValue: co.fairValue + (co.realizedProceeds || 0),
        grossMoic: parseFloat(((co.fairValue + (co.realizedProceeds || 0)) / co.costBasis).toFixed(2)),
        percentOfNav: parseFloat(((co.fairValue / capitalAccount.nav) * 100).toFixed(1)) + '%',
        valuationMethod: co.valuationMethod,
        fairValueLevel: co.fairValueLevel
      })),
      feeDisclosure: {
        managementFee: fund.periodMgmtFee,
        managementFeeRate: fund.mgmtFeeRate,
        feeBase: fund.feeBase,
        organizationalExpenses: fund.orgExpenses,
        fundExpenses: fund.fundExpenses,
        transactionFees: fund.transactionFees,
        monitoringFees: fund.monitoringFees,
        feeOffsets: fund.feeOffsets,
        netManagementFee: fund.periodMgmtFee - (fund.feeOffsets || 0),
        carriedInterestAccrued: fund.carriedInterestAccrued,
        carriedInterestDistributed: fund.carriedInterestDistributed
      }
    };
  }

  /**
   * ILPA fee reporting template
   */
  generateFeeReportingTemplate({ fund, period }) {
    return {
      template: 'ILPA_FEE_REPORTING',
      version: '2.0',
      fundName: fund.name,
      period,
      gpFees: {
        managementFee: {
          rate: fund.mgmtFeeRate,
          base: fund.feeBase,
          amount: fund.mgmtFeeAmount,
          lpaBasis: fund.mgmtFeeBasis // COMMITTED, INVESTED, NAV
        },
        performanceFee: {
          rate: fund.carryRate,
          hurdleRate: fund.preferredReturn,
          crystallized: fund.carryCrystallized,
          accrued: fund.carryAccrued
        }
      },
      portfolioCompanyFees: {
        transactionFees: fund.transactionFees?.map(f => ({
          company: f.company,
          type: f.type,
          amount: f.amount,
          date: f.date,
          offsetApplied: f.offset
        })) || [],
        monitoringFees: fund.monitoringFees?.map(f => ({
          company: f.company,
          annualAmount: f.amount,
          periodAmount: f.periodAmount
        })) || [],
        directorsFeesReceived: fund.directorsFees || 0,
        brokenDealExpenses: fund.brokenDealExpenses || 0
      },
      feeOffsetCalculation: {
        totalOffsettableFees: fund.totalOffsettable || 0,
        offsetPercentage: (fund.offsetPct || 0.80) * 100 + '%',
        offsetAmount: fund.offsetAmount || 0,
        offsetCarriedForward: fund.offsetCarriedForward || 0
      },
      totalCostToLps: {
        netManagementFee: fund.netMgmtFee,
        fundExpenses: fund.fundExpenses,
        organizationalExpenses: fund.orgExpenses,
        totalCost: (fund.netMgmtFee || 0) + (fund.fundExpenses || 0) + (fund.orgExpenses || 0),
        totalCostRatio: fund.nav > 0
          ? parseFloat((((fund.netMgmtFee || 0) + (fund.fundExpenses || 0) + (fund.orgExpenses || 0)) / fund.nav * 10000).toFixed(1)) + ' bps'
          : null
      }
    };
  }
}

module.exports = new IlpaTemplateService();
