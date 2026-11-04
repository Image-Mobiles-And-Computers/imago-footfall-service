import { Router } from 'express';
import { salesCommandController } from './sales.controller';

const router = Router();

// Branch Target Management
router.get('/targets', (req, res) => salesCommandController.getTargets(req, res));
router.post('/targets', (req, res) => salesCommandController.upsertTargets(req, res));

// Real-Time Multi-Branch Revenue Pacing
router.get('/pacing', (req, res) => salesCommandController.getPacing(req, res));

// OEM Brand Contracts & Rebates
router.get('/oem-rebates', (req, res) => salesCommandController.getOemRebates(req, res));

// Remote Price Exception & Discount Approval Tickets (<60s SLA)
router.post('/discount-tickets', (req, res) => salesCommandController.createTicket(req, res));
router.get('/discount-tickets/pending', (req, res) => salesCommandController.getPendingTickets(req, res));
router.get('/discount-tickets/resolved', (req, res) => salesCommandController.getResolvedTickets(req, res));
router.get('/discount-tickets/session/:sessionId', (req, res) => salesCommandController.getTicketBySession(req, res));
router.patch('/discount-tickets/:id/decide', (req, res) => salesCommandController.decideTicket(req, res));
router.post('/discount-tickets/:id/cancel', (req, res) => salesCommandController.cancelTicket(req, res));
router.patch('/discount-tickets/:id/cancel', (req, res) => salesCommandController.cancelTicket(req, res));
// Active Showroom Walk-in Sessions (For Live Concession Linkage)
router.get('/active-walkins', (req, res) => salesCommandController.getActiveWalkins(req, res));

export default router;
