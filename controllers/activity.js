const HttpError = require('../middleware/http-error');
const ActivityLog = require('../models/ActivityLog');
const Counter = require('../models/Counter');
const moment = require('moment/moment');
const { simplePaginate } = require('../services/simplePaginate');

async function generateNextActivityNumber() {
  // eslint-disable-next-line
  return new Promise(async (resolve, reject) => {
    try {
      const next = await Counter.findOneAndUpdate(
        { _id: 'activityNumber' },
        { $inc: { seq: 1 } },
        { new: true }
      );

      if (!next) {
        const newCounter = await Counter({
          _id: 'activityNumber',
          seq: 0
        });
        const saveCounter = await newCounter.save();
        resolve(saveCounter.seq);
      }
      resolve(next.seq);
    } catch (err) {
      reject(err);
    }
  });
}

exports.createUserActivityLog = async (req, res, next) => {
  const {
    userActivityLogId,
    firstname,
    lastname,
    employeeId,
    activity,
    description,
    action,
    storeCode,
    activityDate
  } = req.body;
  const backup = req.query.backup || false;
  const [txnDate, txnTime] = moment(activityDate).format('YYYY-MM-DD HH:mm:ss').split(' ');

  if (!backup) {
    try {
      const newActivityLog = new ActivityLog({
        activityLogId: userActivityLogId,
        transactionId: await generateNextActivityNumber(),
        firstName: firstname,
        lastName: lastname,
        employeeId,
        activity,
        description,
        action,
        storeCode,
        activityDate: new Date(`${txnDate}T${txnTime}Z`)
      });

      const result = await newActivityLog.save();
      return res.status(200).json({ data: result });
    } catch (err) {
      console.log(err);
      const error = new HttpError('Failed to create user activity log, please try again.', 500);
      return next(error);
    }
  } else {
    try {
      return res.status(201).json({ data: 'To create backup for mongodb' });
    } catch (err) {
      return res.status(422).json({ data: 'Error' });
    }
  }
};

exports.getFilteredUserActivityLogs = async (req, res, next) => {
  const {
    page = 1,
    pageSize = 5,
    search = '',
    sortBy = 'transactionId',
    sortOrder = 'desc'
  } = req.query;
  const { storeCode } = req.params;
  const { from, to } = req.query;

  const [fromTxnDate, fromTxnTime] = moment(from)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(to).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

  let query = {};
  if (search) {
    query = { action: { $regex: new RegExp(search, 'i') } };
  }

  if (from) {
    query.activityDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`)
    };
  }

  if (to) {
    query.activityDate = {
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (from && to) {
    query.activityDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }


  if (storeCode) {
    query.storeCode = storeCode;
  }

  const { paginationMeta, limit, skip } = await simplePaginate(
    ActivityLog,
    { page, pageSize },
    query
  );

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  try {
    const activityLogs = await ActivityLog.aggregate([
      { $match: query },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          id: '$transactionId',
          firstname: '$firstName',
          lastname: '$lastName',
          activity: 1,
          description: 1,
          action: 1,
          activityDate: 1,
          transactionId: 1
        }
      }
    ]);

    return res.status(200).json({
      meta: paginationMeta,
      data: activityLogs
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
