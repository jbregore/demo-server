const { body } = require('express-validator');
const User = require('../../models/User');

exports.createEmployeeValidator = [
  body('firstname').notEmpty().withMessage('First name is required'),

  body('middlename').notEmpty().withMessage('Middle name is required'),

  body('lastname').notEmpty().withMessage('Last name is required'),

  body('role').notEmpty().withMessage('Role is required'),

  body('employeeId')
    .notEmpty()
    .withMessage('Employee ID is required')
    .custom(async (value) => {
      const existingEmployee = await User.findOne({ employeeId: value });
      if (existingEmployee) {
        throw new Error('Employee ID already exists');
      }
    }),

  body('contactNumber')
    .notEmpty()
    .withMessage('Contact number is required')
    .custom(async (value) => {
      const existingEmployee = await User.findOne({ contactNumber: value });
      if (existingEmployee) {
        throw new Error('Contact Number already exists');
      }
    }),

  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({
      min: 5
    })
    .withMessage('Username must be minimum of 5 characters long')
    .custom(async (value) => {
      const existingUsername = await User.findOne({ username: value });
      if (existingUsername) {
        throw new Error('Username already exists');
      }
    }),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({
      min: 5
    })
    .withMessage('Password must be minimum of 8 characters long'),

  body('confirmPassword')
    .notEmpty()
    .withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];

exports.updateEmployeeValidator = [
  body('firstname').notEmpty().withMessage('First name is required'),

  body('middlename').notEmpty().withMessage('Middle name is required'),

  body('lastname').notEmpty().withMessage('Last name is required'),

  body('role').notEmpty().withMessage('Role is required'),

  body('employeeId')
    .notEmpty()
    .withMessage('Employee ID is required')
    .custom(async (value, {req}) => {
      const oldEmpId = req.params?.employeeId;

      const existingEmployee = await User.findOne({ employeeId: value});

      if (existingEmployee && existingEmployee.employeeId !== oldEmpId) {
        throw new Error('Employee ID already exists');
      }
      
    }),

  body('contactNumber')
    .notEmpty()
    .withMessage('Contact number is required')
    .custom(async (value, {req}) => {
      const oldEmpId = req.params?.employeeId;

      const existingEmployee = await User.findOne({ contactNumber: value, employeeId: { $ne: oldEmpId } });
      if (existingEmployee) {
        throw new Error('Employee ID already exists');
      }
    })
];
