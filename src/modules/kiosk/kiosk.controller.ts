import { Request, Response } from 'express';
import { KioskService } from './kiosk.service';
import { CopilotService } from './copilot.service';
import { CartTransferService } from './cart-transfer.service';

export async function getCatalog(req: Request, res: Response): Promise<void> {
  try {
    const category = req.query.category as string | undefined;
    const catalog = await KioskService.getCatalog(category);
    res.json({
      success: true,
      count: catalog.length,
      data: catalog,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function compareModels(req: Request, res: Response): Promise<void> {
  try {
    const { modelA, modelB } = req.query;
    if (!modelA || !modelB) {
      res.status(400).json({ success: false, error: 'Query parameters modelA and modelB are required.' });
      return;
    }
    const comparison = await KioskService.compareModels(String(modelA), String(modelB));
    res.json({
      success: true,
      data: comparison,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function get3DModelBySku(req: Request, res: Response): Promise<void> {
  try {
    const sku = String(req.params.sku);
    const catalog = await KioskService.getCatalog();
    const item = catalog.find(m => m.sku === sku);
    if (!item) {
      res.status(404).json({ success: false, error: `3D model for SKU ${sku} not found.` });
      return;
    }
    res.json({ success: true, data: item });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getInventoryPricing(req: Request, res: Response): Promise<void> {
  try {
    const catalog = await KioskService.getCatalog();
    const pricing = catalog.map(c => ({
      sku: c.sku,
      modelName: c.modelName,
      mrp: c.mrpPrice,
      discount: c.discountAmount,
      bankCashback: c.bankCashbackAmount,
      tradeinBonus: c.tradeinBonusAmount,
      netTakeawayPrice: c.effectivePrice,
      monthlyEmi: c.monthlyEmiAmount,
      colorSwatches: c.colorSwatches
    }));
    res.json({ success: true, data: pricing });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function startSession(req: Request, res: Response): Promise<void> {
  try {
    const { kioskId, branchId, walkinSessionId } = req.body;
    if (!kioskId || !branchId) {
      res.status(400).json({ success: false, error: 'kioskId and branchId are required.' });
      return;
    }
    const sessionId = await KioskService.startSession(kioskId, branchId, walkinSessionId);
    res.json({ success: true, sessionId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateSession(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = String(req.params.id);
    await KioskService.updateSession(sessionId, req.body);
    res.json({ success: true, message: 'Session updated' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function logComparisonTelemetry(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, skuA, skuB, durationSeconds } = req.body;
    await KioskService.logComparisonTelemetry(sessionId, skuA, skuB, Number(durationSeconds || 0));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function requestAssistance(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, kioskId, branchId, requestedSku, brandId } = req.body;
    if (!kioskId || !requestedSku) {
      res.status(400).json({ success: false, error: 'kioskId and requestedSku are required.' });
      return;
    }
    const result = await KioskService.requestAssistance({
      sessionId: sessionId || 'sess-anon',
      kioskId,
      branchId: branchId || 'c9832255-2791-401d-88b5-a3d2c870c533',
      requestedSku,
      brandId
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function authenticateCopilot(req: Request, res: Response): Promise<void> {
  try {
    const { pin, branchId } = req.body;
    if (!pin) {
      res.status(400).json({ success: false, error: '4-digit PIN is required.' });
      return;
    }
    const authResult = await CopilotService.authenticateAssociate(String(pin), branchId);
    res.json({ success: authResult.authenticated, ...authResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getCopilotPlaybook(req: Request, res: Response): Promise<void> {
  try {
    const archetype = String(req.query.archetype || 'VALUE_LONGEVITY');
    const category = String(req.query.category || 'Smartphones');
    const playbook = CopilotService.getArchetypePlaybook(archetype, category);
    res.json({ success: true, data: playbook });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function logCopilotSession(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = await CopilotService.logSession(req.body);
    res.json({ success: true, sessionId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function transferCartToPos(req: Request, res: Response): Promise<void> {
  try {
    const { kioskId, branchId, selectedSku, selectedColor, selectedStorage, mrpPrice, discountAmount, bankCashbackAmount, tradeinBonusAmount, employeeId, customerPhone } = req.body;
    if (!kioskId || !selectedSku || !selectedColor || !selectedStorage) {
      res.status(400).json({ success: false, error: 'kioskId, selectedSku, selectedColor and selectedStorage are required.' });
      return;
    }
    const transfer = await CartTransferService.createCartTransfer({
      kioskId,
      branchId: branchId || 'c9832255-2791-401d-88b5-a3d2c870c533',
      selectedSku,
      selectedColor,
      selectedStorage,
      mrpPrice: Number(mrpPrice || 144900),
      discountAmount: Number(discountAmount || 0),
      bankCashbackAmount: Number(bankCashbackAmount || 0),
      tradeinBonusAmount: Number(tradeinBonusAmount || 0),
      employeeId,
      customerPhone
    });
    res.json({ success: true, data: transfer });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getCartTransferToken(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params.token);
    const transfer = await CartTransferService.getTransferByToken(token);
    if (!transfer) {
      res.status(404).json({ success: false, error: `Transfer token ${token} not found or expired.` });
      return;
    }
    res.json({ success: true, data: transfer });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function sendWhatsAppQuotation(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, branchId, customerPhone, quotedSkus, downPaymentAmount, monthlyEmiAmount, financePartnerName } = req.body;
    if (!customerPhone || !quotedSkus) {
      res.status(400).json({ success: false, error: 'customerPhone and quotedSkus are required.' });
      return;
    }
    const quoteId = await KioskService.sendWhatsAppQuotation({
      sessionId: sessionId || 'sess-anon',
      branchId: branchId || 'c9832255-2791-401d-88b5-a3d2c870c533',
      customerPhone,
      quotedSkus,
      downPaymentAmount,
      monthlyEmiAmount,
      financePartnerName
    });
    res.json({
      success: true,
      quoteId,
      message: `Quotation sent successfully to WhatsApp (${customerPhone}).`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getHoCampaigns(req: Request, res: Response): Promise<void> {
  try {
    const campaigns = await KioskService.getHoCampaigns();
    res.json({ success: true, data: campaigns });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getFleetOverview(req: Request, res: Response): Promise<void> {
  try {
    const branchId = req.query.branch_id as string | undefined;
    const fleet = await KioskService.getFleetOverview(branchId);
    res.json({ success: true, count: fleet.length, data: fleet });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function dispatchRemoteCommand(req: Request, res: Response): Promise<void> {
  try {
    const { kioskId, commandType, payload } = req.body;
    if (!kioskId || !commandType) {
      res.status(400).json({ success: false, error: 'kioskId and commandType are required.' });
      return;
    }
    const cmdId = await KioskService.dispatchRemoteCommand(kioskId, commandType, payload);
    res.json({ success: true, commandId: cmdId, message: `Command ${commandType} queued for dispatch.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function recordTerminalHeartbeat(req: Request, res: Response): Promise<void> {
  try {
    const kioskCode = String(req.params.code || req.body.kioskCode);
    const ip = req.ip || req.body.ip;
    await KioskService.recordHeartbeat(kioskCode, ip);
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ── Product Master & Specs Governance CRUD Controllers ─────────

export async function getAllProductsController(req: Request, res: Response): Promise<void> {
  try {
    const category = req.query.category as string | undefined;
    const brand = req.query.brand as string | undefined;
    const search = req.query.search as string | undefined;
    const includeInactive = req.query.includeInactive === 'true' || req.query.include_inactive === 'true';

    const products = await KioskService.getAllProducts({ category, brand, search, includeInactive });
    res.json({
      success: true,
      count: products.length,
      data: products,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getProductBySkuController(req: Request, res: Response): Promise<void> {
  try {
    const sku = String(req.params.sku);
    const product = await KioskService.getProductBySku(sku);
    if (!product) {
      res.status(404).json({ success: false, error: `Product with SKU ${sku} not found.` });
      return;
    }
    res.json({ success: true, data: product });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function createProductController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.body.modelName && !req.body.model_name) {
      res.status(400).json({ success: false, error: 'Product modelName is required.' });
      return;
    }
    const created = await KioskService.createProduct(req.body);
    res.status(201).json({
      success: true,
      message: `Product ${created.modelName} (${created.sku}) successfully registered into showroom catalog.`,
      data: created
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateProductController(req: Request, res: Response): Promise<void> {
  try {
    const sku = String(req.params.sku);
    const updated = await KioskService.updateProduct(sku, req.body);
    res.json({
      success: true,
      message: `Product ${updated.modelName} specifications and commercial pricing updated.`,
      data: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteProductController(req: Request, res: Response): Promise<void> {
  try {
    const sku = String(req.params.sku);
    const hardDelete = req.query.hardDelete === 'true';
    const deleted = await KioskService.deleteProduct(sku, hardDelete);
    if (!deleted) {
      res.status(404).json({ success: false, error: `Product with SKU ${sku} not found or already deactivated.` });
      return;
    }
    res.json({
      success: true,
      message: hardDelete ? `Product ${sku} permanently purged.` : `Product ${sku} deactivated from kiosk showroom display.`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getKioskCategoriesController(req: Request, res: Response): Promise<void> {
  try {
    const categories = await KioskService.getKioskCategories();
    res.json({
      success: true,
      data: categories
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}


