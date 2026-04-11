/**
 * Expense Management & Budgeting Service
 * Fund expenses, management company P&L, expense allocation,
 * organizational expenses, broken deal tracking, budget variance.
 */

class ExpenseManagementService {

  /**
   * Track and categorize fund expenses
   */
  trackFundExpenses(expenses, lpaProvisions) {
    const categorized = {};
    let totalExpenses = 0;

    for (const exp of expenses) {
      if (!categorized[exp.category]) {
        categorized[exp.category] = { items: [], total: 0 };
      }
      categorized[exp.category].items.push(exp);
      categorized[exp.category].total += exp.amount;
      totalExpenses += exp.amount;
    }

    // Check against LPA expense caps
    const capChecks = {};
    for (const [category, cap] of Object.entries(lpaProvisions.expenseCaps || {})) {
      const spent = categorized[category]?.total || 0;
      capChecks[category] = {
        cap,
        spent,
        remaining: cap - spent,
        withinCap: spent <= cap,
        utilizationPct: parseFloat(((spent / cap) * 100).toFixed(1))
      };
    }

    return {
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      byCategory: categorized,
      capChecks,
      expenseRatio: lpaProvisions.averageNav
        ? parseFloat(((totalExpenses / lpaProvisions.averageNav) * 10000).toFixed(1)) + ' bps'
        : null
    };
  }

  /**
   * Management company P&L
   */
  calculateMgmtCoP_L({ revenue, expenses, period }) {
    const totalRevenue = Object.values(revenue).reduce((sum, v) => sum + v, 0);
    const totalExpenses = Object.values(expenses).reduce((sum, v) => sum + v, 0);
    const netIncome = totalRevenue - totalExpenses;

    return {
      period,
      revenue: {
        managementFees: revenue.managementFees || 0,
        advisoryFees: revenue.advisoryFees || 0,
        transactionFees: revenue.transactionFees || 0,
        monitoringFees: revenue.monitoringFees || 0,
        otherRevenue: revenue.other || 0,
        total: totalRevenue
      },
      expenses: {
        compensation: expenses.compensation || 0,
        rent: expenses.rent || 0,
        technology: expenses.technology || 0,
        travel: expenses.travel || 0,
        professional: expenses.professional || 0,
        insurance: expenses.insurance || 0,
        compliance: expenses.compliance || 0,
        other: expenses.other || 0,
        total: totalExpenses
      },
      netIncome: parseFloat(netIncome.toFixed(2)),
      margin: parseFloat(((netIncome / totalRevenue) * 100).toFixed(2)) + '%',
      compensationRatio: parseFloat(((expenses.compensation || 0) / totalRevenue * 100).toFixed(1)) + '%'
    };
  }

  /**
   * Allocate shared expenses across funds
   */
  allocateSharedExpenses({ expense, funds, method = 'aum_weighted' }) {
    let totalWeight = 0;
    const weights = funds.map(f => {
      let weight;
      switch (method) {
        case 'aum_weighted': weight = f.nav; break;
        case 'headcount_weighted': weight = f.headcount; break;
        case 'equal': weight = 1; break;
        case 'commitment_weighted': weight = f.totalCommitments; break;
        default: weight = f.nav;
      }
      totalWeight += weight;
      return { ...f, weight };
    });

    return {
      expense: {
        description: expense.description,
        amount: expense.amount,
        vendor: expense.vendor,
        date: expense.date
      },
      allocationMethod: method,
      allocations: weights.map(f => ({
        fundId: f.id,
        fundName: f.name,
        weight: f.weight,
        allocationPct: parseFloat(((f.weight / totalWeight) * 100).toFixed(4)),
        allocatedAmount: parseFloat((expense.amount * (f.weight / totalWeight)).toFixed(2))
      })),
      totalAllocated: expense.amount
    };
  }

  /**
   * Track broken deal expenses
   */
  trackBrokenDealExpenses(deals, offsetProvision = 1.0) {
    const brokenDeals = deals.filter(d => d.status === 'broken');
    const totalBrokenCosts = brokenDeals.reduce((sum, d) => sum + d.expenses, 0);
    const offsetAmount = totalBrokenCosts * offsetProvision;

    return {
      brokenDeals: brokenDeals.map(d => ({
        dealName: d.name,
        dateAbandoned: d.dateAbandoned,
        expenses: d.expenses,
        categories: {
          legal: d.legalCosts || 0,
          diligence: d.diligenceCosts || 0,
          travel: d.travelCosts || 0,
          consultants: d.consultantCosts || 0,
          other: d.otherCosts || 0
        },
        reason: d.abandonmentReason
      })),
      totalBrokenDealExpenses: parseFloat(totalBrokenCosts.toFixed(2)),
      offsetProvision: (offsetProvision * 100) + '%',
      offsetAgainstMgmtFee: parseFloat(offsetAmount.toFixed(2)),
      fundBorne: parseFloat((totalBrokenCosts - offsetAmount).toFixed(2))
    };
  }

  /**
   * Budget vs. actual variance analysis
   */
  varianceAnalysis({ budget, actual, period }) {
    const categories = new Set([...Object.keys(budget), ...Object.keys(actual)]);
    const variances = {};
    let totalBudget = 0;
    let totalActual = 0;

    for (const cat of categories) {
      const budgeted = budget[cat] || 0;
      const spent = actual[cat] || 0;
      const variance = spent - budgeted;
      const variancePct = budgeted !== 0 ? (variance / budgeted) * 100 : null;

      totalBudget += budgeted;
      totalActual += spent;

      variances[cat] = {
        budgeted,
        actual: spent,
        variance: parseFloat(variance.toFixed(2)),
        variancePct: variancePct !== null ? parseFloat(variancePct.toFixed(1)) + '%' : 'N/A',
        status: variance > budgeted * 0.1 ? 'OVER_BUDGET' : variance < -budgeted * 0.1 ? 'UNDER_BUDGET' : 'ON_TRACK'
      };
    }

    return {
      period,
      lineItems: variances,
      totals: {
        totalBudget,
        totalActual,
        totalVariance: parseFloat((totalActual - totalBudget).toFixed(2)),
        totalVariancePct: parseFloat(((totalActual - totalBudget) / totalBudget * 100).toFixed(1)) + '%'
      },
      overBudgetItems: Object.entries(variances)
        .filter(([, v]) => v.status === 'OVER_BUDGET')
        .map(([cat, v]) => ({ category: cat, ...v }))
    };
  }
  // ==================== ADVANCED EXPENSE MANAGEMENT (v5.0) ====================

  /**
   * Invoice processing with field extraction (structured OCR substitute)
   * In production, integrates with OCR API (Azure Document Intelligence / AWS Textract)
   */
  processInvoice(invoiceData) {
    const invoiceId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    // Extract and validate fields
    const extracted = {
      invoiceNumber: invoiceData.invoiceNumber,
      vendor: invoiceData.vendor,
      vendorTaxId: invoiceData.vendorTaxId || null,
      invoiceDate: invoiceData.invoiceDate,
      dueDate: invoiceData.dueDate,
      currency: invoiceData.currency || 'USD',
      subtotal: invoiceData.subtotal || 0,
      taxAmount: invoiceData.taxAmount || 0,
      totalAmount: invoiceData.totalAmount || invoiceData.subtotal + (invoiceData.taxAmount || 0),
      lineItems: (invoiceData.lineItems || []).map((li, idx) => ({
        lineNumber: idx + 1,
        description: li.description,
        quantity: li.quantity || 1,
        unitPrice: li.unitPrice,
        amount: li.amount || (li.quantity || 1) * li.unitPrice,
        glCode: li.glCode || null,
        costCenter: li.costCenter || null,
        fundAllocation: li.fundAllocation || null
      })),
      paymentTerms: invoiceData.paymentTerms || 'NET_30',
      bankDetails: invoiceData.bankDetails || null
    };

    // Validation
    const validationErrors = [];
    if (!extracted.vendor) validationErrors.push('Missing vendor name');
    if (!extracted.totalAmount || extracted.totalAmount <= 0) validationErrors.push('Invalid total amount');
    if (!extracted.invoiceDate) validationErrors.push('Missing invoice date');
    const lineTotal = extracted.lineItems.reduce((s, li) => s + li.amount, 0);
    if (Math.abs(lineTotal - extracted.subtotal) > 0.01) validationErrors.push(`Line items ($${lineTotal}) don't match subtotal ($${extracted.subtotal})`);

    return {
      invoiceId,
      status: validationErrors.length > 0 ? 'VALIDATION_FAILED' : 'PENDING_APPROVAL',
      extractedData: extracted,
      validationErrors,
      createdAt: now,
      approvalChain: this._getApprovalChain(extracted.totalAmount),
      approvals: [],
      matchedPo: null, // Populated by three-way matching
      matchedReceipt: null
    };
  }

  /**
   * Three-way matching: Purchase Order → Receipt/Delivery → Invoice
   */
  threeWayMatch({ purchaseOrder, receipt, invoice }) {
    const matches = {
      vendorMatch: purchaseOrder.vendor === invoice.vendor,
      amountMatch: Math.abs(purchaseOrder.amount - invoice.totalAmount) < 0.01,
      quantityMatch: true,
      priceMatch: true
    };

    // Line-item level matching
    const lineMatches = [];
    for (const poLine of (purchaseOrder.lineItems || [])) {
      const invLine = (invoice.lineItems || []).find(li => li.description === poLine.description);
      const rcptLine = (receipt.lineItems || []).find(li => li.description === poLine.description);

      lineMatches.push({
        description: poLine.description,
        poQuantity: poLine.quantity,
        receivedQuantity: rcptLine?.quantity || 0,
        invoicedQuantity: invLine?.quantity || 0,
        poPrice: poLine.unitPrice,
        invoicedPrice: invLine?.unitPrice || 0,
        quantityMatch: poLine.quantity === (rcptLine?.quantity || 0) && poLine.quantity === (invLine?.quantity || 0),
        priceMatch: Math.abs(poLine.unitPrice - (invLine?.unitPrice || 0)) < 0.01,
        received: !!rcptLine
      });

      if (!lineMatches[lineMatches.length - 1].quantityMatch) matches.quantityMatch = false;
      if (!lineMatches[lineMatches.length - 1].priceMatch) matches.priceMatch = false;
    }

    const allMatch = matches.vendorMatch && matches.amountMatch && matches.quantityMatch && matches.priceMatch;

    return {
      status: allMatch ? 'FULL_MATCH' : 'EXCEPTION',
      matches,
      lineMatches,
      variance: {
        amount: parseFloat((invoice.totalAmount - purchaseOrder.amount).toFixed(2)),
        variancePct: purchaseOrder.amount > 0 ? parseFloat((((invoice.totalAmount - purchaseOrder.amount) / purchaseOrder.amount) * 100).toFixed(2)) + '%' : 'N/A'
      },
      recommendation: allMatch
        ? 'Auto-approve — full three-way match confirmed'
        : 'Manual review required — discrepancies detected',
      autoApproveEligible: allMatch && invoice.totalAmount <= 10000 // Auto-approve small matched invoices
    };
  }

  /**
   * Approval workflow with escalation
   */
  _getApprovalChain(amount) {
    if (amount <= 5000) return [{ role: 'FUND_ACCOUNTANT', required: true }];
    if (amount <= 25000) return [{ role: 'FUND_ACCOUNTANT', required: true }, { role: 'CONTROLLER', required: true }];
    if (amount <= 100000) return [{ role: 'CONTROLLER', required: true }, { role: 'CFO', required: true }];
    return [{ role: 'CONTROLLER', required: true }, { role: 'CFO', required: true }, { role: 'GP_PRINCIPAL', required: true }];
  }

  /**
   * Vendor management — track approved vendors, spend, and performance
   */
  vendorAnalysis(invoices) {
    const vendors = {};
    for (const inv of invoices) {
      const v = inv.vendor;
      if (!vendors[v]) vendors[v] = { totalSpend: 0, invoiceCount: 0, avgPaymentDays: 0, categories: new Set(), onTimePayments: 0 };
      vendors[v].totalSpend += inv.totalAmount;
      vendors[v].invoiceCount++;
      if (inv.category) vendors[v].categories.add(inv.category);
      if (inv.paidOnTime) vendors[v].onTimePayments++;
    }

    return Object.entries(vendors)
      .map(([name, data]) => ({
        vendor: name,
        totalSpend: parseFloat(data.totalSpend.toFixed(2)),
        invoiceCount: data.invoiceCount,
        avgInvoiceSize: parseFloat((data.totalSpend / data.invoiceCount).toFixed(2)),
        categories: [...data.categories],
        onTimePaymentRate: data.invoiceCount > 0 ? parseFloat(((data.onTimePayments / data.invoiceCount) * 100).toFixed(1)) + '%' : 'N/A'
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend);
  }

  /**
   * Expense trend analysis — compare current period vs historical averages
   */
  trendAnalysis({ currentPeriod, historicalPeriods }) {
    const categories = new Set();
    [currentPeriod, ...historicalPeriods].forEach(p => Object.keys(p.expenses || {}).forEach(k => categories.add(k)));

    const trends = {};
    for (const cat of categories) {
      const historicalValues = historicalPeriods.map(p => p.expenses?.[cat] || 0);
      const avgHistorical = historicalValues.length > 0 ? historicalValues.reduce((s, v) => s + v, 0) / historicalValues.length : 0;
      const currentValue = currentPeriod.expenses?.[cat] || 0;
      const variance = avgHistorical > 0 ? ((currentValue - avgHistorical) / avgHistorical) * 100 : 0;

      trends[cat] = {
        current: currentValue,
        historicalAvg: parseFloat(avgHistorical.toFixed(2)),
        variance: parseFloat(variance.toFixed(1)) + '%',
        trend: variance > 15 ? 'INCREASING' : variance < -15 ? 'DECREASING' : 'STABLE',
        alert: Math.abs(variance) > 25
      };
    }

    return {
      period: currentPeriod.period,
      historicalPeriodsUsed: historicalPeriods.length,
      trends,
      alerts: Object.entries(trends).filter(([, v]) => v.alert).map(([cat, v]) => ({
        category: cat,
        message: `${cat} is ${v.variance} vs historical average ($${v.current} vs $${v.historicalAvg})`,
        severity: Math.abs(parseFloat(v.variance)) > 50 ? 'HIGH' : 'MEDIUM'
      }))
    };
  }

  /**
   * Cost center allocation — tag expenses to deals, funds, functions
   */
  allocateToCostCenters(expenses, costCenters) {
    const allocated = {};
    for (const cc of costCenters) {
      allocated[cc.id] = { name: cc.name, type: cc.type, totalAllocated: 0, items: [] };
    }

    for (const exp of expenses) {
      const ccId = exp.costCenter || 'UNALLOCATED';
      if (!allocated[ccId]) allocated[ccId] = { name: ccId, type: 'UNALLOCATED', totalAllocated: 0, items: [] };
      allocated[ccId].totalAllocated += exp.amount;
      allocated[ccId].items.push({ description: exp.description, amount: exp.amount, date: exp.date });
    }

    const unallocated = allocated['UNALLOCATED']?.totalAllocated || 0;
    const total = expenses.reduce((s, e) => s + e.amount, 0);

    return {
      costCenters: Object.values(allocated).filter(cc => cc.totalAllocated > 0),
      totalExpenses: parseFloat(total.toFixed(2)),
      allocatedExpenses: parseFloat((total - unallocated).toFixed(2)),
      unallocatedExpenses: parseFloat(unallocated.toFixed(2)),
      allocationRate: parseFloat((((total - unallocated) / total) * 100).toFixed(1)) + '%'
    };
  }
}

module.exports = new ExpenseManagementService();
