import { Router } from 'express';
import {
  createWalkIn,
  getActiveWalkIns,
  reassignWalkIn,
  logLostOpportunity,
  manualLinkConversion
} from './walkin.controller';
import { authenticateJwt } from '../../middleware/auth';

const router = Router();

// Store floor associate routes
router.post('/walk-ins', authenticateJwt, createWalkIn);
router.get('/walk-ins/active', authenticateJwt, getActiveWalkIns);
router.patch('/walk-ins/:id/assign', authenticateJwt, reassignWalkIn);
router.post('/walk-ins/:id/lost-opportunity', authenticateJwt, logLostOpportunity);
router.post('/walk-ins/:id/manual-convert', authenticateJwt, manualLinkConversion);

export default router;
