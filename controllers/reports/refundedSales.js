const Order = require('../../models/Order');
const moment = require('moment/moment');

exports.getRefundedSalesByStoreCode = async (req, res, next) => {
  const { storeCode } = req.params;
  const { from, to } = req.query;

  const {
    page = 1,
    pageSize = 5,
    search = '',
    sortBy = 'siNumber',
    sortOrder = 'desc'
  } = req.query;

  const [fromTxnDate, fromTxnTime] = moment(from)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(to).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

  let query = { storeCode: storeCode, status: 'refund' };

  if (from) {
    query.paymentDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`)
    };
  }

  if (to) {
    query.paymentDate = {
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (from && to) {
    query.paymentDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (search) {
    query.siNumber = { $regex: new RegExp(search, 'i') };
  }

  try {
    const unwindCountPipeline = [
      { $match: query },
      { $unwind: '$products' },
      { $match: { 'products.status': { $ne: 'cancelled' } } },
      { $group: { _id: null, totalCount: { $sum: 1 } } }
    ];
    const unwindResult = await Order.aggregate(unwindCountPipeline);

    const totalCount = unwindResult.length > 0 ? unwindResult[0].totalCount : 0;

    const pageNumber = parseInt(page);
    const limit = parseInt(pageSize);
    const skip = (pageNumber - 1) * limit;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const orders = await Order.aggregate([
      { $match: query },
      { $unwind: '$products' },
      { $match: { 'products.status': { $ne: 'cancelled' } } },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limit },
      {
        $addFields: {
          'products.total': '$products.price'
        }
      },
      {
        $project: {
          _id: 0,
          siNumber: '$siNumber',
          productCode: '$products.productCode',
          price: { $toString: '$products.total' },
          cashierId: '$employeeId',
          specsDate: '$orderDate'
        }
      }
    ]);

    const nextPage = skip + limit < totalCount ? pageNumber + 1 : null;
    const lastPage = Math.ceil(totalCount / limit);

    const paginationMeta = {
      totalRecords: totalCount,
      nextPage: nextPage,
      lastPage: lastPage
    };

    return res.status(200).json({
      meta: paginationMeta,
      data: orders
    });
  } catch (err) {
    console.log('err ', err);
    return res.status(400).json({ message: err.message });
  }
};
