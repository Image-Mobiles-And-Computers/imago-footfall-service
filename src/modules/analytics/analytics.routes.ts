import { Router } from 'express';
import { getBranchLiveMetrics, getExecutiveLossAnalytics } from './analytics.controller';
import { authenticateJwt } from '../../middleware/auth';

const router = Router();

// Branch Operations Live Metrics (Touchpoint C)
router.get('/analytics/branch-live', authenticateJwt, getBranchLiveMetrics);

// Executive Loss & Conversion Telemetry (Touchpoint D)
router.get('/analytics/executive-summary', authenticateJwt, getExecutiveLossAnalytics);

export default router;
