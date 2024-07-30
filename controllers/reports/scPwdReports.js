const HttpError = require('../../middleware/http-error');
const SCPWDReport = require('../../models/SCPWDReport');
const moment = require('moment');
const { simplePaginate } = require('../../services/simplePaginate');

exports.getScPwdReports = async (req, res, next) => {
  const { storeCode } = req.params;
  const { from, to } = req.query;
  const {
    page = 1,
    pageSize = 5,
    search = '',
    sortBy = 'txnNumber',
    sortOrder = 'desc',
  } = req.query;

  const [fromTxnDate, fromTxnTime] = moment(from)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(to).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

  try {
    let query = {};

    if (from) {
      query.reportDate = {
        $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`)
      };
    }
  
    if (to) {
      query.reportDate = {
        $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
      };
    }

    if (from && to) {
      query.reportDate = {
        $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
        $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
      };
    }

    if (search) {
      query = { txnNumber: { $regex: new RegExp(search, 'i') } };
    }

    query.storeCode = storeCode;

    const { paginationMeta, limit, skip } = await simplePaginate(
      SCPWDReport,
      { page, pageSize },
      query
    );

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const reports = await SCPWDReport.find(query).sort(sortOptions).limit(limit).skip(skip);

    return res.status(200).json({
      meta: paginationMeta,
      data: reports
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getDateFilterScPwdReports = async (req, res, next) => {
  const { storeCode, dateFilter } = req.params;

  try {
    const [startDay, startTime] = moment(dateFilter)
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss')
      .split(' ');
    const [endDay, endTime] = moment(dateFilter)
      .endOf('day')
      .format('YYYY-MM-DD HH:mm:ss')
      .split(' ');

    const filteredReports = await SCPWDReport.aggregate([
      {
        $match: {
          storeCode,
          reportDate: {
            $gte: new Date(`${startDay}T${startTime}Z`),
            $lte: new Date(`${endDay}T${endTime}Z`)
          }
        }
      },
      {
        $project: {
          firstname: '$firstName',
          lastname: '$lastName',
          type: 1,
          idNumber: 1,
          grossSales: 1,
          discountAmount: 1,
          txnNumber: 1,
          reportDate: 1
        }
      },
      {
        $sort: {
          txnNumber: -1
        }
      }
    ]);

    return res.status(200).json({ data: filteredReports });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};
