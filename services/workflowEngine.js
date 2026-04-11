/**
 * Workflow / Approval Engine
 * Maker-checker-approver for all critical fund operations.
 * Configurable workflows, audit trail, escalation.
 */

class WorkflowEngineService {

  constructor() {
    this.workflows = [];
  }

  /**
   * Create a new approval workflow
   */
  createWorkflow({ type, data, initiator, approvalChain }) {
    const workflow = {
      workflowId: `WF-${Date.now()}`,
      type, // CAPITAL_CALL, DISTRIBUTION, WIRE, VALUATION, EXPENSE, NAV_APPROVAL
      data,
      initiator: {
        name: initiator.name,
        role: initiator.role,
        timestamp: new Date().toISOString()
      },
      approvalChain: approvalChain.map((approver, idx) => ({
        step: idx + 1,
        role: approver.role,
        name: approver.name,
        required: approver.required !== false,
        status: 'PENDING',
        approvedAt: null,
        comments: null
      })),
      currentStep: 1,
      status: 'PENDING_APPROVAL',
      createdAt: new Date().toISOString(),
      completedAt: null,
      auditTrail: [{
        action: 'CREATED',
        by: initiator.name,
        timestamp: new Date().toISOString(),
        details: `Workflow created for ${type}`
      }]
    };

    this.workflows.push(workflow);
    return workflow;
  }

  /**
   * Process an approval step
   */
  processApproval({ workflowId, approver, decision, comments }) {
    const workflow = this.workflows.find(w => w.workflowId === workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    if (workflow.status !== 'PENDING_APPROVAL') throw new Error('Workflow is not pending approval');

    const currentStep = workflow.approvalChain.find(s => s.step === workflow.currentStep);
    if (!currentStep) throw new Error('No pending approval step');

    currentStep.status = decision; // APPROVED, REJECTED, RETURNED
    currentStep.approvedAt = new Date().toISOString();
    currentStep.approvedBy = approver.name;
    currentStep.comments = comments;

    workflow.auditTrail.push({
      action: decision,
      by: approver.name,
      role: approver.role,
      timestamp: new Date().toISOString(),
      step: workflow.currentStep,
      comments
    });

    if (decision === 'REJECTED') {
      workflow.status = 'REJECTED';
      workflow.completedAt = new Date().toISOString();
    } else if (decision === 'RETURNED') {
      workflow.status = 'RETURNED_FOR_REVISION';
      workflow.currentStep = 1;
      // Reset all steps
      workflow.approvalChain.forEach(s => { s.status = 'PENDING'; s.approvedAt = null; });
    } else if (decision === 'APPROVED') {
      const nextStep = workflow.approvalChain.find(s => s.step === workflow.currentStep + 1 && s.required);
      if (nextStep) {
        workflow.currentStep++;
      } else {
        workflow.status = 'APPROVED';
        workflow.completedAt = new Date().toISOString();
      }
    }

    return workflow;
  }

  /**
   * Get workflow templates for common operations
   */
  getWorkflowTemplates() {
    return {
      CAPITAL_CALL: {
        description: 'Capital call issuance',
        defaultChain: [
          { role: 'Fund Accountant', name: null, step: 'Prepare & verify calculations' },
          { role: 'CFO', name: null, step: 'Review and approve amounts' },
          { role: 'Managing Partner', name: null, step: 'Final authorization' }
        ],
        autoEscalation: { afterHours: 24, escalateTo: 'Managing Partner' }
      },
      DISTRIBUTION: {
        description: 'Distribution to LPs',
        defaultChain: [
          { role: 'Fund Accountant', name: null, step: 'Calculate waterfall & withholding' },
          { role: 'Tax Manager', name: null, step: 'Verify withholding amounts' },
          { role: 'CFO', name: null, step: 'Approve distribution' },
          { role: 'Managing Partner', name: null, step: 'Authorize wire execution' }
        ]
      },
      WIRE_TRANSFER: {
        description: 'Outbound wire payment',
        defaultChain: [
          { role: 'Operations', name: null, step: 'Prepare wire instructions (maker)' },
          { role: 'Finance Manager', name: null, step: 'Verify details (checker)' },
          { role: 'CFO', name: null, step: 'Authorize (approver)' }
        ],
        thresholds: [
          { amount: 1000000, additionalApprover: 'Managing Partner' },
          { amount: 10000000, additionalApprover: 'Board / IC' }
        ]
      },
      VALUATION: {
        description: 'Portfolio valuation approval',
        defaultChain: [
          { role: 'Investment Team', name: null, step: 'Prepare valuations' },
          { role: 'Valuation Committee', name: null, step: 'Review & challenge' },
          { role: 'CFO', name: null, step: 'Final sign-off' }
        ]
      },
      NAV_APPROVAL: {
        description: 'NAV calculation approval',
        defaultChain: [
          { role: 'Fund Administrator', name: null, step: 'Calculate NAV' },
          { role: 'Fund Accountant', name: null, step: 'Reconcile & verify' },
          { role: 'CFO', name: null, step: 'Approve NAV for release' }
        ]
      },
      EXPENSE_APPROVAL: {
        description: 'Fund expense approval',
        defaultChain: [
          { role: 'Requestor', name: null, step: 'Submit expense' },
          { role: 'Finance Manager', name: null, step: 'Verify against budget & LPA' },
          { role: 'CFO', name: null, step: 'Approve' }
        ],
        thresholds: [
          { amount: 50000, additionalApprover: 'Managing Partner' }
        ]
      }
    };
  }

  /**
   * Get workflow dashboard
   */
  getDashboard() {
    return {
      total: this.workflows.length,
      pending: this.workflows.filter(w => w.status === 'PENDING_APPROVAL').length,
      approved: this.workflows.filter(w => w.status === 'APPROVED').length,
      rejected: this.workflows.filter(w => w.status === 'REJECTED').length,
      returned: this.workflows.filter(w => w.status === 'RETURNED_FOR_REVISION').length,
      pendingWorkflows: this.workflows
        .filter(w => w.status === 'PENDING_APPROVAL')
        .map(w => ({
          workflowId: w.workflowId,
          type: w.type,
          initiator: w.initiator.name,
          currentStep: w.currentStep,
          pendingApprover: w.approvalChain.find(s => s.step === w.currentStep)?.role,
          createdAt: w.createdAt,
          ageHours: Math.floor((new Date() - new Date(w.createdAt)) / (1000 * 60 * 60))
        })),
      recentlyCompleted: this.workflows
        .filter(w => w.status === 'APPROVED' || w.status === 'REJECTED')
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
        .slice(0, 10)
    };
  }
}

module.exports = new WorkflowEngineService();
