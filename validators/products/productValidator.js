const { body } = require('express-validator');
const Product = require('../../models/Product');

exports.productCreateValidator = [
    body('name').notEmpty().withMessage('Name is required'),
    body('productCode')
      .notEmpty()
      .withMessage('Product code is required')
      .custom(async (value) => {
        const existing = await Product.findOne({ productCode: value })
        if (existing) {
          throw new Error('Product code already exists')
        }
      }),
    body('price')
      .notEmpty()
      .withMessage('Price is required')
      .isNumeric()
      .withMessage('Price must be a number')
      .isFloat({ min: 0 })
      .withMessage('Price must be a positive number'),
    body('category')
      .notEmpty()
      .withMessage('Category is required')
      .isMongoId()
      .withMessage('Category must be a valid ObjectId'),
    body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be a positive integer'),
    body('size').optional().isString().withMessage('Size must be a string'),
    body('color').optional().isString().withMessage('Color must be a string'),
    body('availability').optional().isBoolean().withMessage('Availability must be a boolean'),
    body('vatable').notEmpty().withMessage('Vatable is required')
  ]
  