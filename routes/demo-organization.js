const express = require('express');
const controller = require('../controllers/demo-organization');
const { organizationCreateValidator, organizationUpdateValidator } = require('../validators/demo-organization/organizationValidator');
const router = express.Router();

router.get('/', controller.getOrganizations);
router.get('/:accessKey', controller.showOrganization)
router.post('/', organizationCreateValidator, controller.createOrganization);
router.put('/:organizationId', organizationUpdateValidator, controller.updateOrganization);
router.put('/status/:organizationId', controller.updateOrganizationStatus);
router.delete('/:organizationId', controller.deleteOrganization);

module.exports = router;
