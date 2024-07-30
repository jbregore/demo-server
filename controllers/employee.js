const { validationResult } = require('express-validator');
const User = require('../models/User');
const { simplePaginate } = require('../services/simplePaginate');
const Papa = require('papaparse');
const HttpError = require('../middleware/http-error');

exports.getEmployees = async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      search = '',
      sortBy = 'employeeId',
      sortOrder = 'asc',
      role = "All",
      isArchive = 'All'
    } = req.query;

    let query = {};
    if (search) {
      query = {
        $or: [
          { employeeId: { $regex: new RegExp(search, 'i') } },
          { firstname: { $regex: new RegExp(search, 'i') } },
          { lastname: { $regex: new RegExp(search, 'i') } }
        ]
      };
    }

    query.role = {
      $nin: ['manager', 'it_admin']
    };

    if (role !== "All") {
      query.role = role;
    }
    if (isArchive !== "All") {
      query.isArchive = isArchive;
    }

    const { paginationMeta, limit, skip } = await simplePaginate(User, { page, pageSize }, query);

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const users = await User.find(query).sort(sortOptions).limit(limit).skip(skip);

    return res.status(200).json({
      meta: paginationMeta,
      data: users
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.createEmployee = async (req, res, next) => {
  const { firstname, middlename, lastname, role, employeeId, contactNumber, username, password } =
    req.body;

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  try {
    const user = new User({
      employeeId: employeeId.toUpperCase(),
      firstname,
      middlename,
      lastname,
      role,
      contactNumber,
      username,
      password
    });

    const newUser = await user.save();

    return res.status(201).json({
      message: 'User created successfully',
      data: newUser
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.updateEmployee = async (req, res, next) => {
  const { employeeId: oldEmployeeId } = req.params
  const {
    firstname,
    middlename,
    lastname,
    role,
    employeeId,
    contactNumber,
  } = req.body;

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { employeeId: oldEmployeeId },
      {
        firstname,
        middlename,
        lastname,
        role,
        employeeId,
        contactNumber,
      },
      { new: true }
    );

    return res.status(200).json({
      message: 'User updated successfully',
      data: updatedUser
    });

  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.archiveEmployee = async (req, res, next) => {
  const { employeeId } = req.params;

  try {
    const archivedUser = await User.findOneAndUpdate(
      { employeeId },
      { isArchive: true },
      { new: true }
    );

    return res.status(200).json({
      message: 'User archived successfully',
      data: archivedUser
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.restoreEmployee = async (req, res, next) => {
  const { employeeId } = req.params;

  try {
    const restoredUser = await User.findOneAndUpdate(
      { employeeId },
      { isArchive: false },
      { new: true }
    );

    return res.status(200).json({
      message: 'User restored successfully',
      data: restoredUser
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.importCsv = async (req, res, next) => {
  try {
    const csvData = req.files.file.data.toString();

    const { data: employees, errors } = Papa.parse(csvData, { header: true, skipEmptyLines: true, });

    if (errors.length > 0) {
      const error = new HttpError('Unable to parse CSV file.', 400);
      return next(error);
    }

    const uniqueEmployees = removeCsvDuplicates(employees);
    const formattedEmployees = await formatEmployees(uniqueEmployees);
    await User.insertMany(formattedEmployees);
    return res.status(200).json({ data: 'OK' });
  } catch (err) {
    console.log("err ", err)
    return res.status(400).json({ message: err.message });
  }
};

async function formatEmployees(employees) {
  try {
    const existingEmployees = await User.find({});
    const employeeIds = new Set(existingEmployees.map(employee => employee.employeeId));
    const employeeUsernames = new Set(existingEmployees.map(employee => employee.username));

    return employees
    .filter(employee => !employeeIds.has(employee['Employee ID']) && !employeeUsernames.has(employee['Username']))
      .map((employee) => {

        return {
          employeeId: employee['Employee ID'],
          firstname: employee['First Name'],
          middlename: employee['Middle Name'],
          lastname: employee['Last Name'],
          role: employee['Role'],
          contactNumber: employee['Contact Number'],
          username: employee['Username'],
          password: employee['Password'],
        };
      });
  } catch (error) {
    console.error(error);
  }
}

const removeCsvDuplicates = (employees) => {
  const uniqueEmployees = [];
  const employeeIds = new Set();
  const employeeUsernames = new Set();

  for (const employee of employees) {
    if (!employeeIds.has(employee['Employee ID']) && !employeeUsernames.has(employee['Username'])) {
      uniqueEmployees.push(employee);
      employeeIds.add(employee['Employee ID']);
      employeeUsernames.add(employee['Username']);
    }
  }

  return uniqueEmployees;
}

exports.hasManagerAccount = async (req, res, next) => {
  let hasManager;
  try {
    const count = await User.countDocuments({ role: "manager", isArchive: false });
    hasManager = count > 0;
  } catch (err) {
    const error = new HttpError("Something went wrong, please try again.", 500);
    return next(error);
  }

  res.status(200).json({ hasManager });
};