/**
 * Side Letter & MFN Management Service
 * Provision inventory, MFN election process, compliance monitoring,
 * fee discount tracking, enhanced reporting obligations.
 */

class SideLetterManagerService {

  /**
   * Build complete side letter inventory matrix
   */
  buildInventory(sideLetters) {
    const provisionTypes = new Set();
    const matrix = {};

    for (const sl of sideLetters) {
      matrix[sl.investorId] = {
        investorName: sl.investorName,
        commitment: sl.commitment,
        closingDate: sl.closingDate,
        provisions: {}
      };

      for (const provision of sl.provisions) {
        provisionTypes.add(provision.type);
        matrix[sl.investorId].provisions[provision.type] = {
          description: provision.description,
          terms: provision.terms,
          mfnEligible: provision.mfnEligible !== false
        };
      }
    }

    return {
      totalSideLetters: sideLetters.length,
      provisionTypes: [...provisionTypes],
      matrix,
      summary: this._summarizeProvisions(sideLetters),
      feeImpact: this._calculateFeeImpact(sideLetters)
    };
  }

  /**
   * Process MFN (Most Favored Nation) elections
   */
  processMfnElections({ sideLetters, mfnThreshold, electionDeadline }) {
    // Identify MFN-eligible investors
    const eligible = sideLetters.filter(sl => sl.commitment >= mfnThreshold);
    const ineligible = sideLetters.filter(sl => sl.commitment < mfnThreshold);

    // Compile all available provisions
    const allProvisions = {};
    for (const sl of sideLetters) {
      for (const provision of sl.provisions) {
        if (provision.mfnEligible === false) continue; // Some provisions are explicitly excluded
        const key = `${provision.type}:${provision.terms}`;
        if (!allProvisions[key]) {
          allProvisions[key] = {
            type: provision.type,
            description: provision.description,
            terms: provision.terms,
            grantedTo: []
          };
        }
        allProvisions[key].grantedTo.push(sl.investorName);
      }
    }

    // Generate MFN summary document
    const mfnSummary = Object.values(allProvisions).map(p => ({
      provisionType: p.type,
      description: p.description,
      terms: p.terms,
      grantedToCount: p.grantedTo.length,
      available: true
    }));

    return {
      mfnThreshold,
      electionDeadline,
      eligibleInvestors: eligible.map(sl => ({
        investorId: sl.investorId,
        investorName: sl.investorName,
        commitment: sl.commitment,
        existingProvisions: sl.provisions.length,
        additionalProvisionsAvailable: mfnSummary.filter(p =>
          !sl.provisions.some(ep => ep.type === p.provisionType && ep.terms === p.terms)
        ).length
      })),
      ineligibleInvestors: ineligible.length,
      availableProvisions: mfnSummary,
      totalUniqueProvisions: mfnSummary.length,
      status: 'PENDING_ELECTIONS'
    };
  }

  /**
   * Monitor compliance with all side letter provisions
   */
  monitorCompliance(sideLetters, fundActivity) {
    const violations = [];
    const reminders = [];

    for (const sl of sideLetters) {
      for (const provision of sl.provisions) {
        const check = this._checkProvision(provision, sl, fundActivity);
        if (check.violation) {
          violations.push({
            investorId: sl.investorId,
            investorName: sl.investorName,
            provision: provision.type,
            description: provision.description,
            issue: check.issue,
            severity: check.severity
          });
        }
        if (check.reminder) {
          reminders.push({
            investorId: sl.investorId,
            investorName: sl.investorName,
            provision: provision.type,
            reminder: check.reminder
          });
        }
      }
    }

    return {
      totalProvisions: sideLetters.reduce((sum, sl) => sum + sl.provisions.length, 0),
      compliant: sideLetters.reduce((sum, sl) => sum + sl.provisions.length, 0) - violations.length,
      violations,
      reminders,
      complianceRate: parseFloat(((1 - violations.length / Math.max(1, sideLetters.reduce((sum, sl) => sum + sl.provisions.length, 0))) * 100).toFixed(1)) + '%'
    };
  }

  /**
   * Track fee discount impact from side letters
   */
  _calculateFeeImpact(sideLetters) {
    let totalDiscount = 0;
    const discounts = [];

    for (const sl of sideLetters) {
      const feeProvisions = sl.provisions.filter(p =>
        p.type === 'FEE_DISCOUNT' || p.type === 'REDUCED_CARRY' || p.type === 'REDUCED_MGMT_FEE'
      );

      for (const fp of feeProvisions) {
        const discount = fp.annualImpact || 0;
        totalDiscount += discount;
        discounts.push({
          investorName: sl.investorName,
          commitment: sl.commitment,
          provisionType: fp.type,
          standardRate: fp.standardRate,
          discountedRate: fp.discountedRate,
          annualImpact: discount
        });
      }
    }

    return {
      totalAnnualFeeImpact: parseFloat(totalDiscount.toFixed(2)),
      discountedInvestors: discounts.length,
      discounts,
      averageDiscount: discounts.length > 0
        ? parseFloat((totalDiscount / discounts.length).toFixed(2))
        : 0
    };
  }

  _summarizeProvisions(sideLetters) {
    const summary = {};
    for (const sl of sideLetters) {
      for (const p of sl.provisions) {
        if (!summary[p.type]) summary[p.type] = { count: 0, investors: [] };
        summary[p.type].count++;
        summary[p.type].investors.push(sl.investorName);
      }
    }
    return summary;
  }

  _checkProvision(provision, sideLettor, fundActivity) {
    switch (provision.type) {
      case 'CO_INVEST_RIGHT':
        // Check if qualifying deals were offered
        const qualifyingDeals = fundActivity.deals?.filter(d => d.size >= (provision.threshold || 0));
        const offered = qualifyingDeals?.every(d => d.coInvestOffered?.includes(sideLettor.investorId));
        if (qualifyingDeals?.length > 0 && !offered) {
          return { violation: true, issue: 'Co-invest right not honored on qualifying deal', severity: 'HIGH' };
        }
        return {};

      case 'ENHANCED_REPORTING':
        // Check if enhanced reports were delivered
        if (provision.frequency === 'monthly' && !fundActivity.monthlyReportSent?.includes(sideLettor.investorId)) {
          return { reminder: 'Monthly enhanced report due for this investor' };
        }
        return {};

      case 'EXCUSE_RIGHT':
        // Track excuse elections
        return { reminder: `Investor has excuse right for: ${provision.excludedInvestments || 'certain investments'}` };

      case 'ADVISORY_COMMITTEE_SEAT':
        return { reminder: 'Investor has LPAC seat — ensure meeting invitations are sent' };

      default:
        return {};
    }
  }
}

module.exports = new SideLetterManagerService();
