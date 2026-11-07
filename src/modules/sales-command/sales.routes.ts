import { Router } from 'express';
import { salesCommandController } from './sales.controller';
import { authenticateJwt, optionalAuthenticateJwt, requirePermission } from '../../middleware/auth';
import { requireBranchScope } from '../../middleware/rbacScope';

const router = Router();

// Branch Target Management
router.get('/targets', optionalAuthenticateJwt, (req, res) => salesCommandController.getTargets(req, res));
router.post('/targets', authenticateJwt, requirePermission('sales:quota:manage'), (req, res) => salesCommandController.upsertTargets(req, res));

// Real-Time Multi-Branch Revenue Pacing
router.get('/pacing', optionalAuthenticateJwt, requireBranchScope('branch_id'), (req, res) => salesCommandController.getPacing(req, res));

// OEM Brand Contracts & Rebates
router.get('/oem-rebates', optionalAuthenticateJwt, (req, res) => salesCommandController.getOemRebates(req, res));
router.get('/oem-rebates/promoter-productivity', optionalAuthenticateJwt, requireBranchScope('branch_id'), (req, res) => salesCommandController.getPromoterProductivity(req, res));
router.post('/oem-rebates/contracts', authenticateJwt, requirePermission('oem:contract:manage'), (req, res) => salesCommandController.createOemContract(req, res));
router.put('/oem-rebates/contracts/:id', authenticateJwt, requirePermission('oem:contract:manage'), (req, res) => salesCommandController.updateOemContract(req, res));
router.patch('/oem-rebates/contracts/:id', authenticateJwt, requirePermission('oem:contract:manage'), (req, res) => salesCommandController.updateOemContract(req, res));

// Brand Specialist & OEM Promoter Assignments
router.get('/brand-specialists', optionalAuthenticateJwt, requireBranchScope('branch_id'), (req, res) => salesCommandController.getBrandSpecialists(req, res));
router.put('/brand-specialists/:employeeId', authenticateJwt, requirePermission('oem:contract:manage'), (req, res) => salesCommandController.updateBrandSpecialist(req, res));
router.patch('/brand-specialists/:employeeId', authenticateJwt, requirePermission('oem:contract:manage'), (req, res) => salesCommandController.updateBrandSpecialist(req, res));

// Remote Price Exception & Discount Approval Tickets (<60s SLA)
router.post('/discount-tickets', optionalAuthenticateJwt, (req, res) => salesCommandController.createTicket(req, res));
router.get('/discount-tickets/pending', optionalAuthenticateJwt, requireBranchScope('branch_id'), (req, res) => salesCommandController.getPendingTickets(req, res));
router.get('/discount-tickets/resolved', optionalAuthenticateJwt, requireBranchScope('branch_id'), (req, res) => salesCommandController.getResolvedTickets(req, res));
router.get('/discount-tickets/session/:sessionId', optionalAuthenticateJwt, (req, res) => salesCommandController.getTicketBySession(req, res));
router.patch('/discount-tickets/:id/decide', authenticateJwt, requirePermission('deal:exception:decide'), (req, res) => salesCommandController.decideTicket(req, res));
router.post('/discount-tickets/:id/cancel', authenticateJwt, requirePermission('deal:exception:cancel'), (req, res) => salesCommandController.cancelTicket(req, res));
router.patch('/discount-tickets/:id/cancel', authenticateJwt, requirePermission('deal:exception:cancel'), (req, res) => salesCommandController.cancelTicket(req, res));
// Active Showroom Walk-in Sessions (For Live Concession Linkage)
router.get('/active-walkins', optionalAuthenticateJwt, requireBranchScope('branch_id'), (req, res) => salesCommandController.getActiveWalkins(req, res));

// Enterprise Branches Master (Phase 17.5A Data Integrity)
router.get('/branches', optionalAuthenticateJwt, (req, res) => salesCommandController.getBranches(req, res));

// Sales Spiffs, Contests & Incentive Campaigns (Phase 17.5)
router.get('/spiffs', optionalAuthenticateJwt, (req, res) => salesCommandController.getSpiffs(req, res));
router.post('/spiffs', authenticateJwt, requirePermission('spiff:campaign:create'), (req, res) => salesCommandController.createSpiff(req, res));
router.put('/spiffs/:id', authenticateJwt, requirePermission('spiff:campaign:edit'), (req, res) => salesCommandController.updateSpiff(req, res));
router.get('/spiffs/leaderboard', optionalAuthenticateJwt, requireBranchScope('branch_id'), (req, res) => salesCommandController.getSpiffLeaderboard(req, res));
router.get('/spiffs/branch-leaderboard', optionalAuthenticateJwt, (req, res) => salesCommandController.getBranchSpiffLeaderboard(req, res));
router.post('/spiffs/sync-payroll', authenticateJwt, requirePermission('spiff:payroll:sync'), (req, res) => salesCommandController.syncSpiffsToPayroll(req, res));

// Unified Fleet Broadcast Engine & Dual Cockpit (Phase 17.6)
router.get('/fleet/broadcast-bundles', optionalAuthenticateJwt, (req, res) => salesCommandController.getBroadcastBundles(req, res));
router.post('/fleet/broadcast-bundles', authenticateJwt, requirePermission('fleet:broadcast:publish'), (req, res) => salesCommandController.createBroadcastBundle(req, res));
router.get('/fleet/unified-overview', optionalAuthenticateJwt, (req, res) => salesCommandController.getUnifiedFleetOverview(req, res));
router.post('/fleet/terminals/:terminalId/ping', optionalAuthenticateJwt, (req, res) => salesCommandController.pingTerminal(req, res));

export default router;
