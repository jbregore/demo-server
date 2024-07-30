const { createPromoValidator } = require('../../validators/promo-codes/promoCodeValidator');

exports.batchCreatePromoMiddleware = async (req, res, next) => {
  req.invalidPromoCodes = [];

  for (const promo of req.body) {
    for (const validation of createPromoValidator) {
      const result = await validation.run({ body: promo });

      if (!result.isEmpty()) {
        req.invalidPromoCodes.push(promo.promoCode);
        break;
      }
    }
  }

  next();
};
