import { Request, Response } from 'express';
import { salesCommandService } from './sales.service';

export class SalesCommandController {
  async getTargets(req: Request, res: Response) {
    try {
      const fiscalMonth = (req.query.fiscal_month as string) || '2026-10';
      const targets = await salesCommandService.getBranchTargets(fiscalMonth);
      res.json({
        success: true,
        data: {
          fiscal_month: fiscalMonth,
          targets
        }
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching targets:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async upsertTargets(req: Request, res: Response) {
    try {
      const { fiscal_month, targets } = req.body;
      if (!Array.isArray(targets) || targets.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'targets must be a non-empty array of branch quota objects'
        });
      }

      const result = await salesCommandService.upsertBranchTargets(
        targets,
        fiscal_month || '2026-10',
        (req as any).user?.id || 'HO-COMMERCIAL-USER'
      );

      const updatedPacing = await salesCommandService.getLivePacingOverview(fiscal_month || '2026-10');

      res.json({
        success: true,
        message: `Successfully configured ${result.updatedCount} branch quotas for ${fiscal_month || '2026-10'}`,
        data: updatedPacing
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error upserting targets:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getPacing(req: Request, res: Response) {
    try {
      const fiscalMonth = (req.query.fiscal_month as string) || '2026-10';
      const pacing = await salesCommandService.getLivePacingOverview(fiscalMonth);
      res.json({
        success: true,
        data: pacing
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching pacing:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getOemRebates(req: Request, res: Response) {
    try {
      const fiscalQuarter = (req.query.fiscal_quarter as string) || '2026-Q4';
      const data = await salesCommandService.getOemRebatesDashboard(fiscalQuarter);
      res.json({
        success: true,
        data
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching OEM contracts:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getPromoterProductivity(req: Request, res: Response) {
    try {
      const branchId = (req.query.branch_id as string) || (req as any).branchScope?.targetBranchId;
      const data = await salesCommandService.getPromoterProductivity(branchId);
      res.json({
        success: true,
        data
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching promoter productivity:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async createOemContract(req: Request, res: Response) {
    try {
      const result = await salesCommandService.createOemContract(req.body);
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error saving OEM contract:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateOemContract(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const result = await salesCommandService.updateOemContract(id, req.body);
      if (!result) {
        return res.status(404).json({ success: false, error: `OEM contract ${id} not found` });
      }
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error updating OEM contract:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Brand Specialists & Promoter Assignments ────────────────────────
  async getBrandSpecialists(req: Request, res: Response) {
    try {
      const branchId = req.query.branch_id ? String(req.query.branch_id) : undefined;
      const brandId = req.query.brand_id ? String(req.query.brand_id) : undefined;
      const specialists = await salesCommandService.getBrandSpecialists({ branch_id: branchId, brand_id: brandId });
      res.json({
        success: true,
        data: specialists
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching brand specialists:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateBrandSpecialist(req: Request, res: Response) {
    try {
      const employeeId = String(req.params.employeeId);
      const updated = await salesCommandService.updateBrandSpecialistAssignment(employeeId, req.body);
      res.json({
        success: true,
        message: 'Employee brand partner assignment updated successfully',
        data: updated
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error updating brand specialist assignment:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Remote Price Exception & Discount Approval Tickets (<60s SLA) ───
  async createTicket(req: Request, res: Response) {
    try {
      const {
        walkin_session_id,
        branch_id,
        cashier_user_id,
        cashier_name,
        customer_phone,
        customer_name,
        product_sku,
        product_name,
        mrp,
        landed_cost_fifo,
        requested_discount,
        discount_reason
      } = req.body;

      if (!branch_id || !product_name || !mrp || requested_discount === undefined) {
        return res.status(400).json({
          success: false,
          error: 'branch_id, product_name, mrp, and requested_discount are required'
        });
      }

      const ticket = await salesCommandService.createDiscountTicket({
        walkin_session_id,
        branch_id,
        cashier_user_id: cashier_user_id || (req as any).user?.id,
        cashier_name: cashier_name || (req as any).user?.name,
        customer_phone: customer_phone || 'Customer Phone',
        customer_name,
        product_sku,
        product_name,
        mrp: Number(mrp),
        landed_cost_fifo: landed_cost_fifo ? Number(landed_cost_fifo) : undefined,
        requested_discount: Number(requested_discount),
        discount_reason: discount_reason || 'Customer request'
      });

      res.status(201).json({
        success: true,
        message: `Price concession ticket ${ticket.ticket_number} created with 60s SLA`,
        data: ticket
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error creating ticket:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getPendingTickets(req: Request, res: Response) {
    try {
      const tickets = await salesCommandService.getPendingDiscountTickets();
      res.json({
        success: true,
        data: tickets
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching pending tickets:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getResolvedTickets(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 30;
      const tickets = await salesCommandService.getResolvedDiscountTickets(limit);
      res.json({
        success: true,
        data: tickets
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching resolved tickets:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getTicketBySession(req: Request, res: Response) {
    try {
      const sessionId = String(req.params.sessionId);
      const ticket = await salesCommandService.getTicketBySessionId(sessionId);
      res.json({
        success: true,
        data: ticket
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching ticket by session:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async decideTicket(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { action, approved_discount, counter_bundle_notes } = req.body;

      if (!action || !['APPROVE', 'COUNTER_OFFER', 'REJECT'].includes(action)) {
        return res.status(400).json({
          success: false,
          error: 'action must be APPROVE, COUNTER_OFFER, or REJECT'
        });
      }

      const ticket = await salesCommandService.decideDiscountTicket(id, {
        action,
        approved_discount: approved_discount !== undefined ? Number(approved_discount) : undefined,
        counter_bundle_notes,
        reviewed_by_user_id: (req as any).user?.id || 'HO-COMMERCIAL-OPS'
      });

      res.json({
        success: true,
        message: `Ticket ${ticket.ticket_number} marked as ${ticket.status}`,
        data: ticket
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error deciding ticket:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async cancelTicket(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { reason } = req.body;
      const cancelledBy = (req as any).user?.name || (req as any).user?.id || 'STORE-ASSOCIATE';

      const ticket = await salesCommandService.cancelDiscountTicket(id, reason, cancelledBy);

      res.json({
        success: true,
        message: `Ticket ${ticket.ticket_number} cancelled and walk-in session returned to In Service`,
        data: ticket
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error cancelling ticket:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getActiveWalkins(req: Request, res: Response) {
    try {
      const branchId = req.query.branch_id ? String(req.query.branch_id) : undefined;
      const walkins = await salesCommandService.getActiveWalkinSessions(branchId);
      res.json({
        success: true,
        count: walkins.length,
        data: walkins
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching active walkins:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ==============================================================================
  // PHASE 17.5: SPIFF BOOSTER CAMPAIGNS & LEADERBOARD CONTROLLER METHODS
  // ==============================================================================

  async getSpiffs(req: Request, res: Response) {
    try {
      const campaigns = await salesCommandService.getSpiffCampaigns();
      res.json({
        success: true,
        count: campaigns.length,
        data: campaigns
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching spiffs:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async createSpiff(req: Request, res: Response) {
    try {
      const created = await salesCommandService.createSpiffCampaign({
        ...req.body,
        created_by_ho_user_id: (req as any).user?.id || 'HO-COMMERCIAL-USER'
      });
      res.status(201).json({
        success: true,
        message: `Flash Spiff Booster "${created.campaign_title}" launched successfully`,
        data: created
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error creating spiff:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async updateSpiff(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const updated = await salesCommandService.updateSpiffCampaign(id, req.body);
      res.json({
        success: true,
        message: `Flash Spiff Booster "${updated.campaign_title}" updated successfully`,
        data: updated
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error updating spiff:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getSpiffLeaderboard(req: Request, res: Response) {
    try {
      const campaignId = req.query.campaign_id ? String(req.query.campaign_id) : undefined;
      const leaderboard = await salesCommandService.getSpiffLeaderboard(campaignId);
      res.json({
        success: true,
        count: leaderboard.length,
        data: leaderboard
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching spiff leaderboard:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getBranchSpiffLeaderboard(req: Request, res: Response) {
    try {
      const campaignId = req.query.campaign_id ? String(req.query.campaign_id) : undefined;
      const leaderboard = await salesCommandService.getBranchSpiffLeaderboard(campaignId);
      res.json({
        success: true,
        count: leaderboard.length,
        data: leaderboard
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching branch spiff leaderboard:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async syncSpiffsToPayroll(req: Request, res: Response) {
    try {
      const fiscalMonth = (req.body.fiscal_month as string) || '2026-10';
      const result = await salesCommandService.syncSpiffsToPayroll(fiscalMonth);
      res.json({
        success: true,
        message: result.total_records > 0 
          ? `Successfully synchronized ₹${result.total_amount.toLocaleString()} in verified booster spiffs across ${result.employee_count} specialists to HR Payroll`
          : 'All earned spiffs are already synced to HR Payroll',
        data: result
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error syncing spiffs to payroll:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getBranches(req: Request, res: Response) {
    try {
      const branches = await salesCommandService.getBranches();
      res.json({
        success: true,
        count: branches.length,
        data: branches
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching branches:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ==============================================================================
  // PHASE 17.6: UNIFIED FLEET BROADCAST BUNDLES & DUAL MONITOR
  // ==============================================================================

  async getBroadcastBundles(req: Request, res: Response) {
    try {
      const bundles = await salesCommandService.getBroadcastBundles();
      res.json({
        success: true,
        count: bundles.length,
        data: bundles
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching broadcast bundles:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async createBroadcastBundle(req: Request, res: Response) {
    try {
      const created = await salesCommandService.createBroadcastBundle({
        ...req.body,
        dispatched_by_ho_user_id: (req as any).user?.id || 'usr-ho-sales-director'
      });
      res.status(201).json({
        success: true,
        message: `Unified Broadcast Bundle "${created.bundle_name}" successfully dispatched to ${created.acknowledged_terminal_count} showroom terminals!`,
        data: created
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error creating broadcast bundle:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getUnifiedFleetOverview(req: Request, res: Response) {
    try {
      const overview = await salesCommandService.getUnifiedFleetOverview();
      res.json({
        success: true,
        data: overview
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching unified fleet overview:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async pingTerminal(req: Request, res: Response) {
    try {
      const terminalId = req.params.terminalId || req.body.terminal_id;
      const type = (req.body.type || 'GREETING') as 'GREETING' | 'KIOSK';
      const result = await salesCommandService.pingTerminal(terminalId, type);
      res.json({
        success: true,
        message: `Terminal ${terminalId} heartbeat refreshed`,
        data: result
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error pinging terminal:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export const salesCommandController = new SalesCommandController();
