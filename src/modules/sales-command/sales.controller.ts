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
      const contracts = await salesCommandService.getOemRebateContracts(fiscalQuarter);
      res.json({
        success: true,
        data: {
          fiscal_quarter: fiscalQuarter,
          contracts
        }
      });
    } catch (error: any) {
      console.error('[SalesCommandController] Error fetching OEM contracts:', error);
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
}

export const salesCommandController = new SalesCommandController();
