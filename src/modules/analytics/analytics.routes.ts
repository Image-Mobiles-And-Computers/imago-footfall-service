import { Router } from 'express';
import { 
  getBranchLiveMetrics, 
  getExecutiveLossAnalytics, 
  getSkuLossDetails, 
  getBranchInsights,
  getBranchComparison,
  getSalesAssociatesPerformance
} from './analytics.controller';
import { authenticateJwt } from '../../middleware/auth';

const router = Router();

// Branch Operations Live Metrics (Touchpoint C)
router.get('/analytics/branch-live', authenticateJwt, getBranchLiveMetrics);

// Executive Loss & Conversion Telemetry (Touchpoint D)
router.get('/analytics/executive-summary', authenticateJwt, getExecutiveLossAnalytics);
router.get('/analytics/sku-loss-details', authenticateJwt, getSkuLossDetails);

// Data-driven Showroom Strengths & Conversion Opportunity Areas
router.get('/analytics/branch-insights', authenticateJwt, getBranchInsights);

// Touchpoint E: Cross-Branch Head-to-Head & Benchmark Comparison (Executive)
router.get('/analytics/branch-comparison', authenticateJwt, getBranchComparison);

// Touchpoint F: Store Sales Team Performance & Rep Telemetry (Store Manager)
router.get('/analytics/sales-associates', authenticateJwt, getSalesAssociatesPerformance);

export default router;
