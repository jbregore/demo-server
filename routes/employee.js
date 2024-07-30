const express = require('express');
const controller = require('../controllers/employee');
const { createEmployeeValidator, updateEmployeeValidator } = require('../validators/employee/employeeValidator');
const router = express.Router();

router.get('/', controller.getEmployees);
router.post('/', createEmployeeValidator, controller.createEmployee);

router.patch('/:employeeId', updateEmployeeValidator, controller.updateEmployee);

router.patch('/archive/:employeeId', controller.archiveEmployee);
router.patch('/restore/:employeeId', controller.restoreEmployee);

router.post('/import-csv', controller.importCsv);
router.get('/has-manager', controller.hasManagerAccount);

module.exports = router;
