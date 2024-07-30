const { body } = require('express-validator');
const DemoOrganization = require('../../models/DemoOrganization');

exports.organizationCreateValidator = [
    body('name').notEmpty().withMessage('Name is required'),
    body('user')
        .notEmpty()
        .withMessage('User is required')
        .custom(async (value) => {
            const existing = await DemoOrganization.findOne({ user: value })
            if (existing) {
                throw new Error('User already exists')
            }
        }),
    body('deviceId')
        .notEmpty()
        .withMessage('Device ID is required')
        .custom(async (value) => {
            const existing = await DemoOrganization.findOne({ deviceId: value })
            if (existing) {
                throw new Error('Device ID already exists')
            }
        }),
    body('apiKey')
        .notEmpty()
        .withMessage('API Key is required')
        .custom(async (value) => {
            const existing = await DemoOrganization.findOne({ apiKey: value })
            if (existing) {
                throw new Error('API Key already exists')
            }
        }),
    body('status').notEmpty().withMessage('Status is required'),
]

exports.organizationUpdateValidator = [
    body('name').notEmpty().withMessage('Name is required')
        .custom(async (value, { req }) => {
            const organizationId = req.params?.organizationId;
            const existing = await DemoOrganization.findOne({
                name: value,
                _id: { $ne: organizationId }
            });
            if (existing) {
                throw new Error('Name already exists');
            }
        }),
    body('user')
        .notEmpty()
        .withMessage('User is required')
        .custom(async (value, { req }) => {
            const organizationId = req.params?.organizationId;
            const existing = await DemoOrganization.findOne({
                user: value,
                _id: { $ne: organizationId }
            });
            if (existing) {
                throw new Error('User already exists');
            }
        }),
    body('deviceId')
        .notEmpty()
        .withMessage('Device ID is required')
        .custom(async (value, { req }) => {
            const organizationId = req.params?.organizationId;
            const existing = await DemoOrganization.findOne({
                deviceId: value,
                _id: { $ne: organizationId }
            });
            if (existing) {
                throw new Error('Device ID already exists');
            }
        }),
    body('apiKey')
        .notEmpty()
        .withMessage('API Key is required')
        .custom(async (value, { req }) => {
            const organizationId = req.params?.organizationId;
            const existing = await DemoOrganization.findOne({
                apiKey: value,
                _id: { $ne: organizationId }
            });
            if (existing) {
                throw new Error('API Key already exists');
            }
        }),
]