const moment = require('moment/moment');
const { simplePaginate } = require('../../services/simplePaginate');
const Preview = require('../../models/Preview');

exports.getReturnExchangeByStoreCode = async (req, res, next) => {
  const { storeCode } = req.params;
  const { from, to } = req.query;

  const {
    page = 1,
    pageSize = 5,
    search = '',
    sortOrder = 'desc'
  } = req.query;

  const [fromTxnDate, fromTxnTime] = moment(from)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(to).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

  let query = { storeCode: storeCode, type: 'return' };

  if (from) {
    query.transactionDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`)
    };
  }

  if (to) {
    query.transactionDate = {
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (from && to) {
    query.transactionDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (search) {
    query['data.cart.siNumber'] = { $regex: new RegExp(search, 'i') };
  }

  const sortOptions = {};
  sortOptions['data.cart.siNumber'] = sortOrder === 'desc' ? -1 : 1;

  try {

    const { paginationMeta, limit, skip } = await simplePaginate(
      Preview,
      { page, pageSize },
      query
    );

    const returns = await Preview.aggregate([
      {
        $match: query
      },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          amount: '$data.cart.amounts.subtotal',
          returnedBy: '$data.cashier.id',
          returnSiNumber: { $concat: ['$data.cart.siNumber', '-1'] },
          returnDate: '$transactionDate',
          remarks: '$data.cart.remarks'
        }
      }
    ]);

    const exchanges = await Preview.aggregate([
      {
        $match: {
          'data.cart.payments.value': 'rmes',
          'data.cart.branchCode': storeCode,
          transactionDate: {
            $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
            $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
          }
        }
      },
      {
        $unwind: '$data.cart.payments'
      },
      {
        $project: {
          refSiNumber: '$data.cart.payments.siNumber',
          exchangeAmount: '$data.cart.payments.amount',
          exchangeDate: '$transactionDate',
          exchangeSiNumber: '$data.cart.siNumber'
        }
      }
    ]);

    const mergedData = returns.map((returnItem) => {
      const exchangeItem = exchanges.find((exchange) => exchange.refSiNumber === returnItem.returnSiNumber);
      
      return {
        returnSiNumber: returnItem.returnSiNumber,
        returnAmount: `-${returnItem.amount}`,
        returnedBy: returnItem.returnedBy,
        returnDate: returnItem.returnDate,
        exchangeSiNumber: exchangeItem ? exchangeItem.exchangeSiNumber : '-',
        exchangeAmount: exchangeItem ? `${exchangeItem.exchangeAmount}` : '-',
        exchangeDate: exchangeItem ? exchangeItem.exchangeDate : '-',
        remarks: returnItem.remarks
      };
    });

    return res.status(200).json({
      meta: paginationMeta,
      data: mergedData,
    });
  } catch (err) {
    console.log('err ', err);
    return res.status(400).json({ message: err.message });
  }
};
