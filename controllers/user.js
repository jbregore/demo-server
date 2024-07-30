const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");

const HttpError = require("../middleware/http-error");
const User = require("../models/User");

exports.createEmployee = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422)
    );
  }

  const {
    employeeId,
    firstName,
    middleName,
    lastName,
    role,
    contactNumber,
    username,
    password,
    isAdmin,
  } = req.body;

  // check if user exist
  let userExist;
  try {
    userExist = await User.findOne({ username });
  } catch (err) {
    const error = new HttpError("Something went wrong, please try again.", 500);
    return next(error);
  }

  if (userExist) {
    const error = new HttpError("User already exist.", 422);
    return next(error);
  }

  // hash password
  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(password, 12);
  } catch (err) {
    const error = new HttpError(
      "Could not create user, please try again.",
      500
    );
    return next(error);
  }

  // create user
  const createdUser = new User({
    firstName,
    middleName,
    lastName,
    role,
    employeeId,
    contactNumber,
    username,
    password: hashedPassword,
    isAdmin,
  });

  try {
    await createdUser.save();
  } catch (err) {
    const error = new HttpError(
      "Signing up failed, please try again later.",
      500
    );
    return next(error);
  }

  res.status(201).json({ data: createdUser });
};

exports.getAllEmployee = async (req, res, next) => {
  let employees;
  try {
    employees = await User.find({ role: { $ne: "admin" }, isArchive: false });
  } catch (err) {
    const error = new HttpError("Something went wrong, please try again.", 500);
    return next(error);
  }

  res.status(200).json({ data: employees });
};

exports.updateEmployee = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422)
    );
  }

  const {
    employeeId,
    firstName,
    middleName,
    lastName,
    role,
    contactNumber,
    username,
    isAdmin,
  } = req.body;
  const { id } = req.params;

  let updatedEmployee;
  try {
    updatedEmployee = await User.findByIdAndUpdate(id, {
      employeeId,
      firstName,
      middleName,
      lastName,
      role,
      contactNumber,
      username,
      isAdmin,
    });
  } catch (err) {
    const error = new HttpError(
      "Failed to update employee details, please try again later.",
      500
    );
    return next(error);
  }

  res.status(200).json({ data: updatedEmployee });
};

exports.archiveEmployee = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422)
    );
  }

  const { isArchive } = req.body;
  const { id } = req.params;

  let archivedEmployee;
  try {
    archivedEmployee = await User.findByIdAndUpdate(id, {
      isArchive,
    });
  } catch (err) {
    const error = new HttpError(
      "Failed to update employee details, please try again later.",
      500
    );
    return next(error);
  }

  res.status(200).json({ data: archivedEmployee });
};
