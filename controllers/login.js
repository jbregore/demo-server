const jwt = require('jsonwebtoken');
const HttpError = require('../middleware/http-error');
const moment = require('moment');
const User = require('../models/User');
const ReadLog = require('../models/ReadLog');
const CashLog = require('../models/CashLog');
const LoginLog = require('../models/LoginLog');

exports.login = async (req, res, next) => {
  let { username, password, storeCode, posDate } = req.body;

  const [txnDate] = posDate.split(' ');
  const [, startTime] = moment(txnDate).startOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');
  const [, endTime] = moment(txnDate).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');
  let user;
  try {
    const findUser = await User.findOne({
      username
    });
    if (!findUser) return next(new HttpError("user not found", 404));
    if (findUser.password !== password) return next(new HttpError("invalid credentials", 401));
    if (findUser.isArchive) return next(new HttpError("user is disabled", 403));

    user = findUser;

  } catch (err) {
    const error = new HttpError('Failed to logged in, please try again.', 500);
    return next(error);
  }

  if (!user) {
    const error = new HttpError('Invalid username or password.', 400);
    return next(error);
  }

  const fullname = `${user.firstname} ${user.lastname}`;
  const token = jwt.sign(
    {
      employee: user.employeeId,
      name: fullname
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: 86400 }
  );

  user.token = token;

  // check for initial cash logs
  let transactionDate = false;
  try {
    const prevZRead = await ReadLog.findOne({
      storeCode,
      type: 'z-read',
    }).sort({ readDate: -1 });

    console.log(`Prev Z Read is `, prevZRead);
    if (prevZRead) {
      transactionDate = moment(prevZRead.readDate).utc().add(1, 'day').format('YYYY-MM-DD HH:mm:ss');
    }

  } catch (err) {
    const error = new HttpError('Failed to check read logs logs, please try again.', 500);

    return next(error);
  }

  const currentDate = transactionDate ? moment(transactionDate).format('YYYY-MM-DD') : moment(posDate).format('YYYY-MM-DD');
  console.log(`Current Date is `, currentDate);
  let initialCash = false;
  try {
    const initCashLog = await CashLog.findOne(
      {
        type: "initial",
        employeeId: user.employeeId,
        branchCode: storeCode,
        cashDate: {
          $gte: new Date(`${currentDate}T${startTime}Z`),
          $lte: new Date(`${currentDate}T${endTime}Z`),
        }
      }
    );

    initialCash = initCashLog ? true : false;
  } catch (err) {
    console.log(err);
    const error = new HttpError(
      'Failed to check reports read logs, please try again.',
      500
    );

    return next(error);
  }

  res.status(200).json({ data: user, initialCash, transactionDate });
};

exports.createLoginLogs = async (req, res, next) => {
  const { loginId, employeeId, storeCode, transactionDate } = req.body;

  try {
    const [txnDate, txnTime] = transactionDate.split(' ');
    const loginLogs = await LoginLog.aggregate(
      [
        {
          '$addFields': {
            'loginDateString': {
              '$dateToString': {
                'format': '%Y-%m-%d',
                'date': '$loginDate'
              }
            }
          }
        }, {
          '$match': {
            'loginDateString': txnDate,
            'employeeId': employeeId,
            'storeCode': storeCode,
          }
        },
        {
          '$limit': 1
        }
      ]
    );

    if (loginLogs.length > 0) {
      return res.status(200).json({
        transactionDate: loginLogs[0].loginDate
      });
    }

    console.log(`Login Date is `, new Date(`${txnDate}T${txnTime}Z`));
    const newLoginLog = new LoginLog({
      loginId,
      employeeId,
      storeCode,
      loginDate: new Date(`${txnDate}T${txnTime}Z`)
    });
    await newLoginLog.save();

    return res.status(200).json({ transactionDate });
  } catch (err) {

    const error = new HttpError('Failed to create login logs, please try again.', 500);
    return next(error);
  }
};

exports.checkIsXRead = async (req, res, next) => {
  const { cashierId, transactionDate } = req.query;

  try {
    const txnDate = transactionDate.split(' ')[0];
    const [txnDateStart, txnTimeStart] = moment(txnDate).startOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');
    const [txnDateEnd, txnTimeEnd] = moment(txnDate).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

    const hasXRead = await ReadLog.findOne({
      txnDate: {
        $gte: new Date(`${txnDateStart}T${txnTimeStart}Z`),
        $lte: new Date(`${txnDateEnd}T${txnTimeEnd}Z`)
      },
      employeeId: cashierId
    });

    res.status(200).json({
      isXRead: hasXRead ? true : false
    });
  } catch (err) {
    const error = new HttpError('Failed to check x-read, please try again.', 500);

    return next(error);
  }
};

exports.getLoginLogsById = async (req, res, next) => {
  const { employeeId, transactionDate } = req.params;

  try {
    const txnDate = transactionDate.split(' ')[0];
    const startTime = moment(txnDate).startOf('day').format('HH:mm:ss');
    const endTime = moment(txnDate).endOf('day').format('HH:mm:ss');

    const loginLog = await LoginLog.findOne({
      loginDate: {
        $gte: new Date(`${txnDate}T${startTime}Z`),
        $lte: new Date(`${txnDate}T${endTime}Z`),
      },
      employeeId
    });


    console.log(`Login log is `, loginLog);

    res.status(200).json({
      realtimeLogs: loginLog?.createdAt
    });

  } catch (err) {
    const error = new HttpError("Failed to check user's logs, please try again.", 500);

    return next(error);
  }
};
