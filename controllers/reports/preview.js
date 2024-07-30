const Preview = require('../../models/Preview');
const HttpError = require('../../middleware/http-error');
const moment = require('moment');
const { simplePaginate } = require('../../services/simplePaginate');

exports.createPreview = async (req, res, next) => {
  const { txnNumber, type, storeCode, transactionDate, data } = req.body;
  const [date, time] = transactionDate.split(' ');

  // check for existing
  if (type === 'z-read') {
    let zReadExist;
    try {
      const [, startTime] = moment(transactionDate).startOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');
      const [, endTime] = moment(transactionDate).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

      zReadExist = await Preview.findOne({
        transactionDate: {
          $gte: new Date(`${date}T${startTime}Z`),
          $lte: new Date(`${date}T${endTime}Z`)
        },
        storeCode: storeCode,
        type: 'z-read'
      });
    } catch (err) {
      const error = new HttpError('Failed to check z read, please try again.', 500);
      return next(error);
    }

    if (zReadExist) {
      const error = new HttpError('Z read already exist.', 422);
      return next(error);
    }
  }

  const createdPreview = new Preview({
    txnNumber,
    type,
    storeCode,
    transactionDate: new Date(`${date}T${time}Z`),
    data
  });

  try {
    await createdPreview.save();
  } catch (err) {
    console.log(err);
    const error = new HttpError('Creating preview failed, please try again.', 500);
    return next(error);
  }

  res.status(201).json({ data: createdPreview });
};

exports.getPreviewByStoreCode = async (req, res, next) => {
  const { storeCode } = req.params;
  const { from, to } = req.query;
  const {
    page = 1,
    pageSize = 5,
    search = '',
    sortBy = 'transactionDate',
    sortOrder = 'desc'
  } = req.query;

  const [fromTxnDate, fromTxnTime] = moment(from)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(to)
    .endOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');

  let query = {};

  if (search) {
    query = {
      'data.cart.siNumber': { $regex: new RegExp(search, 'i') }
    };
  }

  query.storeCode = storeCode;

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

  const { paginationMeta, limit, skip } = await simplePaginate(Preview, { page, pageSize }, query);

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  try {
    const previews = await Preview.find(query).sort(sortOptions).limit(limit).skip(skip);

    return res.status(200).json({
      meta: paginationMeta,
      data: previews
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getOnePreview = async (req, res, next) => {
  const { orderId } = req.params;
  let preview = false;

  try {
    preview = await Preview.findOne({ 'data.cart.confirmOrders.*.orderId': orderId });
  } catch (err) {
    const error = new HttpError('Failed to fetch preview, please try again.', 500);
    return next(error);
  }

  res.status(200).json({ data: preview });
};
