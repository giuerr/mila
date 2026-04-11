/**
 * Server-Sent Events (SSE) for LP Portal
 * Real-time NAV updates, capital call notifications, signing queue updates.
 */

class LiveEventService {
  constructor() {
    this.clients = new Map(); // investorId -> Set of response objects
    this.globalClients = new Set(); // Admin/CFO clients watching all events
  }

  /**
   * Register an SSE client for an investor
   */
  addClient(investorId, res) {
    if (!this.clients.has(investorId)) {
      this.clients.set(investorId, new Set());
    }
    this.clients.get(investorId).add(res);

    res.on('close', () => {
      this.clients.get(investorId)?.delete(res);
      if (this.clients.get(investorId)?.size === 0) {
        this.clients.delete(investorId);
      }
    });
  }

  /**
   * Register an SSE client for admin/CFO (all events)
   */
  addGlobalClient(res) {
    this.globalClients.add(res);
    res.on('close', () => this.globalClients.delete(res));
  }

  /**
   * Send event to specific investor
   */
  sendToInvestor(investorId, eventType, data) {
    const clients = this.clients.get(investorId);
    if (clients) {
      const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const client of clients) {
        try { client.write(payload); } catch (e) { clients.delete(client); }
      }
    }
    // Also send to global clients
    this._sendToGlobal(eventType, { investorId, ...data });
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [investorId, clients] of this.clients) {
      for (const client of clients) {
        try { client.write(payload); } catch (e) { clients.delete(client); }
      }
    }
    this._sendToGlobal(eventType, data);
  }

  /**
   * Emit NAV update event
   */
  emitNavUpdate(fundId, fundName, newNav, previousNav) {
    this.broadcast('nav_update', {
      fundId,
      fundName,
      newNav,
      previousNav,
      change: newNav - previousNav,
      changePct: previousNav > 0 ? parseFloat((((newNav - previousNav) / previousNav) * 100).toFixed(2)) : 0,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit capital call notification to specific LP
   */
  emitCapitalCall(investorId, { fundId, fundName, callNumber, amount, dueDate }) {
    this.sendToInvestor(investorId, 'capital_call', {
      fundId, fundName, callNumber, amount, dueDate,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit distribution notification
   */
  emitDistribution(investorId, { fundId, fundName, amount, type }) {
    this.sendToInvestor(investorId, 'distribution', {
      fundId, fundName, amount, type,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit signing request
   */
  emitSigningRequest(investorId, { envelopeId, documentName, signingUrl }) {
    this.sendToInvestor(investorId, 'signing_request', {
      envelopeId, documentName, signingUrl,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit report available notification
   */
  emitReportAvailable(investorId, { reportType, fundName, period, downloadUrl }) {
    this.sendToInvestor(investorId, 'report_available', {
      reportType, fundName, period, downloadUrl,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get connection stats
   */
  getStats() {
    let totalInvestorConnections = 0;
    for (const clients of this.clients.values()) {
      totalInvestorConnections += clients.size;
    }
    return {
      connectedInvestors: this.clients.size,
      totalInvestorConnections,
      globalClients: this.globalClients.size,
      totalConnections: totalInvestorConnections + this.globalClients.size
    };
  }

  _sendToGlobal(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.globalClients) {
      try { client.write(payload); } catch (e) { this.globalClients.delete(client); }
    }
  }
}

module.exports = new LiveEventService();
