
const uniqid = require('uniqid');
const PromoCode = require('../models/PromoCode');
const { validationResult } = require('express-validator');
const { simplePaginate } = require('../services/simplePaginate');

exports.getAllPromoCodes = async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 5,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = {};
    if (search) {
      query = { promoName: { $regex: new RegExp(search, 'i') } };
    }

    const { paginationMeta, limit, skip } = await simplePaginate(
      PromoCode,
      { page, pageSize },
      query
    );

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const promoCodes = await PromoCode.aggregate([
      { $match: query },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limit },
      {
        $addFields: {
          promoCode: '$promoName',
          dateStart: '$dateFrom',
          dateEnd: '$dateTo',
          timeStart: '$timeFrom',
          timeEnd: '$timeTo'
        }
      }
    ]);

    return res.status(200).json({
      meta: paginationMeta,
      data: promoCodes
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.createPromoCode = async (req, res, next) => {
  const { type, value, promoCode, item, transaction, date, time, days, storeCode, isRestricted } =
    req.body;
  const promoName = promoCode.toUpperCase();
  const promoCodeId = uniqid(`${promoName}-`).toUpperCase();
  const errors = validationResult(req);


  if (!errors.isEmpty()) {
    console.log(errors.array());
    return res.status(422).json({ errors: errors.array() });
  }

  try {
    const promoCode = new PromoCode({
      promoCodeId,
      type,
      value,
      promoName,
      itemDiscount: item,
      transactionDiscount: transaction,
      dateFrom: date.start,
      dateTo: date.end,
      timeFrom: time.start,
      timeTo: time.end,
      days,
      storeCode,
      isArchive: false,
      isRestricted
    });

    const newPromoCode = await promoCode.save();

    return res.status(201).json({
      message: 'Promo created successfully',
      data: newPromoCode
    });
  } catch (err) {
    // console.log(err.errors.promoName);
    if (err.errors.promoName) return res.status(422).json({
      errors: [
        {
          value: promoCode,
          msg: err.errors.promoName.properties.message,
          param: 'promoCode',
          location: 'body'
        }
      ]
    });
    return res.status(400).json({ message: err.message });
  }
};

exports.batchCreatePromoCode = async (req, res, next) => {
  try {
    let [saved, failed] = [0, 0];    
    for (const promo of req.body) {
      if (req.invalidPromoCodes.includes(promo.promoCode)) {
        failed++;
        continue;
      }

      const {
        type,
        value,
        promoCode,
        item,
        transaction,
        date,
        time,
        days,
        storeCode,
        isRestricted
      } = promo;

      const promoName = promoCode.toUpperCase();
      const promoCodeId = uniqid(`${promoName}-`).toUpperCase();

      const p = new PromoCode({
        promoCodeId,
        type,
        value,
        promoName,
        itemDiscount: item === 'false' ? false : true,
        transactionDiscount: transaction === 'false' ? false : true,
        dateFrom: date.start,
        dateTo: date.end,
        timeFrom: time.start,
        timeTo: time.end,
        days,
        storeCode,
        isArchive: false,
        isRestricted: isRestricted === 'false' ? false : true
      });
      await p.save();

      saved++;
    }

    return res.status(200).json({
      message:
        `Downloaded ${saved} promo codes.` +
        (failed > 0 ? ` Failed to download ${failed} promo codes.` : ''),
      data: {
        saved,
        failed
      }
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.deletePromoCode = async (req, res, next) => {
  const { promoId } = req.params;

  try {
    //TODO: check if the promo is being used by user return 401

    await PromoCode.findByIdAndDelete(promoId);
    return res.status(200).json({ message: 'Promo deleted' });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
