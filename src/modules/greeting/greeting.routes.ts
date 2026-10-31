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
  updateHoCampaign,
  getGreetingTerminals,
  registerGreetingTerminal,
  updateGreetingTerminal,
  recordTerminalHeartbeat,
  getFleetOverview,
  disconnectTerminal,
  toggleBrandBroadcast
} from './greeting.controller';
import { authenticateJwt, optionalAuthenticateJwt } from '../../middleware/auth';

const router = Router();

// 1. Entrance Greeter Quick Intake & Lookup
router.post('/greeting/walkin', optionalAuthenticateJwt, quickIntakeWalkIn);
router.get('/greeting/customer-lookup', optionalAuthenticateJwt, lookupCustomerByPhone);
router.post('/greeting/recommendation', optionalAuthenticateJwt, getRoutingRecommendation);

// 2. Real-Time Floor Staff Presence Board
router.get('/greeting/staff/status', optionalAuthenticateJwt, getStaffFloorPresence);
router.patch('/greeting/staff/:employee_id/status', authenticateJwt, updateStaffFloorStatus);

// 3. Peak-Hour Virtual Queue & Token Management
router.post('/greeting/tokens', optionalAuthenticateJwt, issueQueueToken);
router.get('/greeting/tokens', optionalAuthenticateJwt, getActiveQueueTokens);
router.patch('/greeting/tokens/:id/call', authenticateJwt, callQueueToken);
router.patch('/greeting/tokens/:id/status', authenticateJwt, updateQueueTokenStatus);

// 4. Head Office (HO) Sales Campaigns & Fleet Monitor
router.get('/greeting/ho/campaigns', optionalAuthenticateJwt, getActiveHoCampaigns);
router.post('/greeting/ho/campaigns', authenticateJwt, createHoCampaign);
router.put('/greeting/ho/campaigns/:id', authenticateJwt, updateHoCampaign);
router.patch('/greeting/ho/campaigns/:id', authenticateJwt, updateHoCampaign);
router.patch('/greeting/ho/brands/:brand_name/toggle', authenticateJwt, toggleBrandBroadcast);
router.get('/greeting/fleet/overview', optionalAuthenticateJwt, getFleetOverview);

// 5. Hardware Greeting Terminals & Heartbeat
router.get('/greeting/terminals', optionalAuthenticateJwt, getGreetingTerminals);
router.post('/greeting/terminals', authenticateJwt, registerGreetingTerminal);
router.patch('/greeting/terminals/:id/setup', authenticateJwt, updateGreetingTerminal);
router.post('/greeting/terminals/:id/heartbeat', optionalAuthenticateJwt, recordTerminalHeartbeat);
router.post('/greeting/terminals/:code/disconnect', optionalAuthenticateJwt, disconnectTerminal);

export default router;
