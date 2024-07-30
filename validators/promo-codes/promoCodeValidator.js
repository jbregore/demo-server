const { body } = require('express-validator');
const PromoCode = require('../../models/PromoCode');

exports.createPromoValidator = [
  body('type').notEmpty().withMessage('Type is required'),

  body('value').notEmpty().withMessage('Value is required'),

  body('promoCode')
    .notEmpty()
    .withMessage('Promo code is required')
    .custom(async (value) => {
      const existingPromo = await PromoCode.findOne({ promoName: value });
      if (existingPromo) {
        throw new Error('Promo already exists');
      }
    }),

  body('item')
    .notEmpty()
    .withMessage('Item field is required')
    .isIn(['true', 'false'])
    .withMessage('Item field must be either "y" or "n"'),

  body('transaction')
    .notEmpty()
    .withMessage('Transaction field is required')
    .isIn(['true', 'false'])
    .withMessage('Transaction field must be either "y" or "n"'),

  body('date.start').optional(),

  body('date.end').optional(),

  body('time.start').optional(),

  body('time.end').optional(),

  body('days')
    .isArray()
    .withMessage('Days must be an array')
    .custom((value) => {
      const validDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const invalidDays = value.filter((day) => !validDays.includes(day));
      if (invalidDays.length > 0) {
        throw new Error(`Invalid days selected: ${invalidDays.join(', ')}`);
      }
      return 'true';
    }),

  body('storeCode').notEmpty().withMessage('Store code is required'),

  body('isRestricted')
    .notEmpty()
    .withMessage('Item field is required')
    .isIn(['true', 'false'])
    .withMessage('Item field must be either "true" or "false"')
];
