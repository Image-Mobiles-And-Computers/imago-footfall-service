import { Router } from 'express';
import {
  getCatalog,
  compareModels,
  get3DModelBySku,
  getInventoryPricing,
  startSession,
  updateSession,
  logComparisonTelemetry,
  requestAssistance,
  authenticateCopilot,
  getCopilotPlaybook,
  logCopilotSession,
  transferCartToPos,
  getCartTransferToken,
  sendWhatsAppQuotation,
  getHoCampaigns,
  getFleetOverview,
  dispatchRemoteCommand,
  recordTerminalHeartbeat,
  getAllProductsController,
  getProductBySkuController,
  createProductController,
  updateProductController,
  deleteProductController,
  getKioskCategoriesController
} from './kiosk.controller';
import { optionalAuthenticateJwt, authenticateJwt } from '../../middleware/auth';

const router = Router();

// 1. Digital Showroom Catalog & Multi-Device Comparison
router.get('/kiosk/categories', optionalAuthenticateJwt, getKioskCategoriesController);
router.get('/kiosk/catalog', optionalAuthenticateJwt, getCatalog);
router.get('/kiosk/compare', optionalAuthenticateJwt, compareModels);
router.get('/kiosk/models/3d/:sku', optionalAuthenticateJwt, get3DModelBySku);
router.get('/kiosk/inventory/pricing', optionalAuthenticateJwt, getInventoryPricing);

// 1b. Retail Catalog Governance & Product Master (Admin & Sales)
router.get('/kiosk/products', optionalAuthenticateJwt, getAllProductsController);
router.get('/kiosk/products/:sku', optionalAuthenticateJwt, getProductBySkuController);
router.post('/kiosk/products', optionalAuthenticateJwt, createProductController);
router.put('/kiosk/products/:sku', optionalAuthenticateJwt, updateProductController);
router.delete('/kiosk/products/:sku', optionalAuthenticateJwt, deleteProductController);


// 2. Interactive Session & Dwell Telemetry
router.post('/kiosk/sessions', optionalAuthenticateJwt, startSession);
router.patch('/kiosk/sessions/:id', optionalAuthenticateJwt, updateSession);
router.post('/kiosk/telemetry/compare', optionalAuthenticateJwt, logComparisonTelemetry);

// 3. On-Demand Floor Associate Paging
router.post('/kiosk/assistance/request', optionalAuthenticateJwt, requestAssistance);

// 4. Salesperson Co-Pilot & Objection Assistant Mode
router.post('/kiosk/copilot/auth', optionalAuthenticateJwt, authenticateCopilot);
router.get('/kiosk/copilot/playbook', optionalAuthenticateJwt, getCopilotPlaybook);
router.post('/kiosk/copilot/session', optionalAuthenticateJwt, logCopilotSession);

// 5. 1-Tap Cart Transfer to POS Billing Desk
router.post('/kiosk/cart/transfer-pos', optionalAuthenticateJwt, transferCartToPos);
router.get('/kiosk/cart/transfer/:token', optionalAuthenticateJwt, getCartTransferToken);

// 6. Omnichannel WhatsApp Quotations
router.post('/kiosk/quotes/whatsapp', optionalAuthenticateJwt, sendWhatsAppQuotation);

// 7. Head Office (HO) Fleet Management & Remote Commands
router.get('/kiosk/ho/campaigns', optionalAuthenticateJwt, getHoCampaigns);
router.get('/kiosk/ho/fleet/overview', optionalAuthenticateJwt, getFleetOverview);
router.post('/kiosk/ho/fleet/command', authenticateJwt, dispatchRemoteCommand);
router.post('/kiosk/terminals/:code/heartbeat', optionalAuthenticateJwt, recordTerminalHeartbeat);

export default router;
