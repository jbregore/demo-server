const DiscountLog = require('../../models/DiscountLog');
const moment = require('moment/moment');
const { simplePaginate } = require('../../services/simplePaginate');

exports.getDiscountsReports = async (req, res, next) => {
  const { storeCode } = req.params;
  const { from, to } = req.query;

  const { page = 1, pageSize = 5, search = '' } = req.query;

  const [fromTxnDate, fromTxnTime] = moment(from)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(to).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

  let query = { storeCode: storeCode, discount: { $nin: ['SCD', 'PWD', 'VAT', 'DPLMTS'] } };

  if (from) {
    query.discountDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`)
    };
  }

  if (to) {
    query.discountDate = {
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (from && to) {
    query.discountDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (search) {
    query.txnNumber = { $regex: new RegExp(search, 'i') };
  }

  try {
    const { paginationMeta, limit, skip } = await simplePaginate(
      DiscountLog,
      { page, pageSize },
      query
    );

    const discounts = await DiscountLog.aggregate([
      { $sort: { discountDate: -1 } },
      { $match: query },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          type: '$discount',
          amount: 1,
          txn_number: '$txnNumber',
          discount_date: '$discountDate',
          po_number: '$poNumber',
        }
      }
    ]);

    return res.status(200).json({
      meta: paginationMeta,
      data: discounts
    });
  } catch (err) {
    console.log('err ', err);
    return res.status(400).json({ message: err.message });
  }
};
