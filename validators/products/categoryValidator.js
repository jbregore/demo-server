const { body } = require('express-validator');
const Category = require('../../models/Category');

exports.createCategoryValidator = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({
      min: 2
    })
    .withMessage('Name must be minimum of 2 characters long')
    .custom(async (value) => {
      const existing = await Category.findOne({ name: value });
      if (existing) {
        throw new Error('Name already exists');
      }
    })
];

exports.updateCategoryValidator = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({
      min: 2
    })
    .withMessage('Name must be minimum of 2 characters long')
    .custom(async (value, { req }) => {
      const categoryId = req.params?.categoryId;
      const existing = await Category.findOne({
        name: value,
        _id: { $ne: categoryId }
      });
      if (existing) {
        throw new Error('Name already exists');
      }
    })
];
