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
}

export const salesCommandController = new SalesCommandController();
