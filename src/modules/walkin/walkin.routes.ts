import { Router } from 'express';
import {
  createWalkIn,
  getActiveWalkIns,
  getAllWalkIns,
  reassignWalkIn,
  logLostOpportunity,
  manualLinkConversion,
  lookupCustomer
} from './walkin.controller';
import { authenticateJwt } from '../../middleware/auth';

const router = Router();

// Store floor associate routes
router.get('/customers/lookup', authenticateJwt, lookupCustomer);
router.post('/walk-ins', authenticateJwt, createWalkIn);
router.get('/walk-ins', authenticateJwt, getAllWalkIns);
router.get('/walk-ins/active', authenticateJwt, getActiveWalkIns);
router.patch('/walk-ins/:id/assign', authenticateJwt, reassignWalkIn);
router.post('/walk-ins/:id/lost-opportunity', authenticateJwt, logLostOpportunity);
router.post('/walk-ins/:id/manual-convert', authenticateJwt, manualLinkConversion);

export default router;
