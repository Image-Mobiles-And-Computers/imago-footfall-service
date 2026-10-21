import { Router } from 'express';
import { handlePosWebhook, simulatePosSale } from './pos-webhook.controller';
import { authenticateJwt } from '../../middleware/auth';

const router = Router();

// Ingestion webhook endpoint (accepts POS webhook callbacks)
router.post('/webhook/pos-transaction', handlePosWebhook);

// Simulator endpoint for store staff and developers to test live reconciliation
router.post('/webhook/simulate-pos-sale', authenticateJwt, simulatePosSale);

export default router;
