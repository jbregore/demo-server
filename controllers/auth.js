const { validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const moment = require("moment");

const HttpError = require("../middleware/http-error");
const User = require("../models/User");
const Report = require("../models/Report");
const AuthLog = require("../models/AuthenticationLog");

exports.authenticateUser = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422)
    );
  }

  const { username, password, storeCode, posDate } = req.body;

  // check if user exist
  let user;
  try {
    user = await User.findOne({ username });
  } catch (err) {
    const error = new HttpError(
      "Logging in failed, please try again later.",
      500
    );
    return next(error);
  }

  if (!user) {
    const error = new HttpError(
      "Invalid credentials, could not log you in.",
      403
    );
    return next(error);
  }

  // verify password
  let isValidPassword = false;
  try {
    isValidPassword = await bcrypt.compare(password, user.password);
  } catch (err) {
    const error = new HttpError(
      "Could not log you in, please check your credentials and try again.",
      500
    );
    return next(error);
  }

  if (!isValidPassword) {
    const error = new HttpError(
      "Invalid credentials, could not log you in.",
      403
    );
    return next(error);
  }

  // - set token
  // - check for initial cash logs
  let token;
  let transactionDate = false;
  let initialCash = false;
  try {
    // set token
    const fullname = `${user.firstname} ${user.lastname}`;
    token = jwt.sign(
      {
        employee: user.employeeId,
        name: fullname,
      },
      process.env.JWT_SECRET_KEY,
      { expiresIn: 86400 }
    );

    user.token = token;

    // check for z-reading report
    const zReadExist = await Report.findOne({
      storeCode,
      type: "z-read",
    })
      .select("posDate")
      .sort({ posDate: -1 });

    let posDateQuery;
    if (zReadExist) {
      transactionDate = zReadExist;
      const readDate = transactionDate.posDate;
      posDateQuery = new Date(readDate);
      posDateQuery.setDate(posDateQuery.getDate() + 1);
      posDateQuery = `${posDateQuery.getFullYear()}-${
        posDateQuery.getMonth() + 1
      }-${posDateQuery.getDate()}`;
    }

    // get initial cash
    const getDate = new Date(transactionDate ? posDateQuery : posDate);
    const startDate = moment(getDate).startOf("day").toString();
    const endDate = moment(getDate).endOf("day").toString();

    const initialExist = await Report.findOne({
      employeeId: user.employeeId,
      type: "initial",
      posDate: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    initialCash = initialExist ? true : false;
  } catch (err) {
    const error = new HttpError(
      "Logging in failed, please try again later.",
      500
    );
    return next(error);
  }

  res.status(200).json({
    data: {
      employeeId: user.employeeId,
      firstname: user.firstName,
      lastname: user.lastName,
      isAdmin: user.isAdmin,
    },
    initialCash,
    transactionDate,
  });
};

exports.createLogs = async (req, res, next) => {
  const { employeeId, storeCode, transactionDate } = req.body;

  let loginExist;
  try {
    const getDate = new Date(transactionDate);
    const startDate = moment(getDate).startOf("day").toString();
    const endDate = moment(getDate).endOf("day").toString();

    loginExist = await AuthLog.findOne({
      employeeId,
      posDate: {
        $gte: startDate,
        $lte: endDate,
      },
    });
  } catch (err) {
    const error = new HttpError("Something went wrong, please try again.", 500);
    return next(error);
  }

  // create log
  if (!loginExist) {
    const createdLog = new AuthLog({
      employeeId,
      storeCode,
      posDate: moment(new Date(transactionDate)).toString(),
    });

    try {
      await createdLog.save();
    } catch (err) {
      const error = new HttpError(
        "Something went wrong, please try again later.",
        500
      );
      return next(error);
    }

    res.status(200).json({
      transactionDate,
    });
  } else {
    res.status(200).json({
      transactionDate: loginExist.posDate,
    });
  }
};
