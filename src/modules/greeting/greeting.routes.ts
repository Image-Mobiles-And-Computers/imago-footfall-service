import { Router } from 'express';
import {
  quickIntakeWalkIn,
  lookupCustomerByPhone,
  getStaffFloorPresence,
  updateStaffFloorStatus,
  getRoutingRecommendation,
  issueQueueToken,
  getActiveQueueTokens,
  callQueueToken,
  updateQueueTokenStatus,
  getActiveHoCampaigns,
  createHoCampaign,
  getGreetingTerminals,
  registerGreetingTerminal,
  recordTerminalHeartbeat,
  getFleetOverview
} from './greeting.controller';
import { authenticateJwt } from '../../middleware/auth';

const router = Router();

// 1. Entrance Greeter Quick Intake & Lookup
router.post('/greeting/walkin', authenticateJwt, quickIntakeWalkIn);
router.get('/greeting/customer-lookup', authenticateJwt, lookupCustomerByPhone);
router.post('/greeting/recommendation', authenticateJwt, getRoutingRecommendation);

// 2. Real-Time Floor Staff Presence Board
router.get('/greeting/staff/status', authenticateJwt, getStaffFloorPresence);
router.patch('/greeting/staff/:employee_id/status', authenticateJwt, updateStaffFloorStatus);

// 3. Peak-Hour Virtual Queue & Token Management
router.post('/greeting/tokens', authenticateJwt, issueQueueToken);
router.get('/greeting/tokens', authenticateJwt, getActiveQueueTokens);
router.patch('/greeting/tokens/:id/call', authenticateJwt, callQueueToken);
router.patch('/greeting/tokens/:id/status', authenticateJwt, updateQueueTokenStatus);

// 4. Head Office (HO) Sales Campaigns & Fleet Monitor
router.get('/greeting/ho/campaigns', authenticateJwt, getActiveHoCampaigns);
router.post('/greeting/ho/campaigns', authenticateJwt, createHoCampaign);
router.get('/greeting/fleet/overview', authenticateJwt, getFleetOverview);

// 5. Hardware Greeting Terminals & Heartbeat
router.get('/greeting/terminals', authenticateJwt, getGreetingTerminals);
router.post('/greeting/terminals', authenticateJwt, registerGreetingTerminal);
router.post('/greeting/terminals/:id/heartbeat', authenticateJwt, recordTerminalHeartbeat);

export default router;
