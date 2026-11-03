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

export default router;
