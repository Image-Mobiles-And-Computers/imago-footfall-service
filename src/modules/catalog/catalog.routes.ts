import { Router } from 'express';
import {
  getBrands, getBrandById, createBrand, updateBrand, deleteBrand,
  getCategories, createCategory, updateCategory, deleteCategory,
  getTaxonomies, createTaxonomy, updateTaxonomy, deleteTaxonomy,
  getProducts, getProductById, createProduct, updateProduct, deleteProduct,
  resetMasterCatalog
} from './catalog.controller';
import { authenticateJwt, requirePermission } from '../../middleware/auth';

const router = Router();

// Public / Read routes
router.get('/brands', getBrands);
router.get('/brands/:id', getBrandById);
router.get('/categories', getCategories);
router.get('/taxonomies', getTaxonomies);
router.get('/products', getProducts);
router.get('/products/:id', getProductById);

// Protected Brand Master CRUD
router.post('/brands', authenticateJwt, requirePermission('catalog:manage'), createBrand);
router.put('/brands/:id', authenticateJwt, requirePermission('catalog:manage'), updateBrand);
router.delete('/brands/:id', authenticateJwt, requirePermission('catalog:manage'), deleteBrand);

// Protected Category Master CRUD
router.post('/categories', authenticateJwt, requirePermission('catalog:manage'), createCategory);
router.put('/categories/:id', authenticateJwt, requirePermission('catalog:manage'), updateCategory);
router.delete('/categories/:id', authenticateJwt, requirePermission('catalog:manage'), deleteCategory);

// Protected Reason Taxonomies CRUD
router.post('/taxonomies', authenticateJwt, requirePermission('catalog:manage'), createTaxonomy);
router.put('/taxonomies/:id', authenticateJwt, requirePermission('catalog:manage'), updateTaxonomy);
router.delete('/taxonomies/:id', authenticateJwt, requirePermission('catalog:manage'), deleteTaxonomy);

// Protected Product Master CRUD
router.post('/products', authenticateJwt, requirePermission('catalog:manage'), createProduct);
router.put('/products/:id', authenticateJwt, requirePermission('catalog:manage'), updateProduct);
router.delete('/products/:id', authenticateJwt, requirePermission('catalog:manage'), deleteProduct);

// Super Admin Reset / Seed Re-sync
router.post('/admin/reset-taxonomies', authenticateJwt, requirePermission('catalog:manage'), resetMasterCatalog);

export default router;
