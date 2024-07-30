const express = require('express');
const controller = require('../controllers/inventory');
const { createCategoryValidator, updateCategoryValidator } = require('../validators/products/categoryValidator');
const { productCreateValidator } = require('../validators/products/productValidator');
const router = express.Router();

router.get('/all-categories', controller.getAllCategories);

router.get('/categories', controller.getCategories);
router.post('/categories', createCategoryValidator, controller.createCategory);
router.put('/categories/:categoryId', updateCategoryValidator, controller.updateCategory);
router.delete('/categories/:categoryId', controller.deleteCategory);

//admin products
router.get('/all-products', controller.getAllProducts);

router.get('/products', controller.getProducts);
router.post('/products', productCreateValidator, controller.createProduct);
router.patch('/products/:productCode', controller.updateProduct);

router.post('/update-products-csv', controller.updateProductsFromCsv);
router.post('/update-products-online', controller.updateProductsFromOnline);
router.get('/remove-products', controller.removeProducts);

module.exports = router;
