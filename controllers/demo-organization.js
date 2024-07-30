const { validationResult } = require('express-validator');
const DemoOrganization = require('../models/DemoOrganization');
const { simplePaginate } = require('../services/simplePaginate');
const UmbraSystemsConfig = require('../models/UmbraSystemsConfig');
const { resetCollections } = require('./settings');

exports.getOrganizations = async (req, res, next) => {
    try {
        const { page = 1, pageSize = 5, search = '', sortBy = 'updatedAt', sortOrder = 'desc' } = req.query;

        let query = {};
        if (search) {
            query = { name: { $regex: new RegExp(search, 'i') } };
        }

        const { paginationMeta, limit, skip } = await simplePaginate(
            DemoOrganization,
            { page, pageSize },
            query
        );

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const organizations = await DemoOrganization.find(query)
            .sort(sortOptions)
            .limit(limit).skip(skip);

        return res.status(200).json({
            meta: paginationMeta,
            data: organizations
        });
    } catch (err) {
        return res.status(400).json({ message: err.message });
    }
}

exports.showOrganization = async (req, res, next) => {
    const { accessKey } = req.params;

    try {
        const organization = await DemoOrganization.findOne({ accessKey });

        if (!organization) {
            return res.status(401).json({ message: 'Organization not found' });
        }

        return res.status(200).json({
            data: organization
        });
    } catch (err) {
        return res.status(400).json({ message: err.message });
    }
}

exports.createOrganization = async (req, res, next) => {
    const { name, user, deviceId, apiKey, date, status, accessKey } = req.body;

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }

    try {
        const newOrganization = new DemoOrganization({
            name, user, deviceId, apiKey, date, status, accessKey
        });

        await newOrganization.save();
        return res.status(201).json({ message: 'Organization created successfully', data: newOrganization });
    } catch (err) {
        return res.status(400).json({ message: err.message });
    }
};

exports.updateOrganization = async (req, res, next) => {
    const { organizationId } = req.params;
    const { name, user, deviceId, apiKey, date } = req.body;

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }

    try {
        const organization = await DemoOrganization.findByIdAndUpdate(organizationId, { name, user, deviceId, apiKey, date }, { new: true });

        if (!organization) {
            return res.status(401).json({ message: 'Organization not found' });
        }

        return res.status(200).json({
            message: 'Organization updated successfully',
            data: organization
        });
    } catch (err) {
        return res.status(400).json({ message: err.message });
    }
};

exports.updateOrganizationStatus = async (req, res, next) => {
    const { organizationId } = req.params;
    const { action, resetData } = req.body

    try {
        if (action === "Enabled") {

            await DemoOrganization.updateMany({}, { status: 'Disabled' });

            const organization = await DemoOrganization.findByIdAndUpdate(organizationId, { status: 'Enabled' }, { new: true });

            if (!organization) {
                return res.status(401).json({ message: 'Organization not found' });
            }

            const umbraSystemsConfig = await UmbraSystemsConfig.findOne();

            if (umbraSystemsConfig) {
                umbraSystemsConfig.deviceId = organization.deviceId;
                umbraSystemsConfig.apiKey = organization.apiKey;
                umbraSystemsConfig.status = 'disconnected';
                await umbraSystemsConfig.save();
            } else {
                const defaultConfig = {
                    endpoint: process.env.UMBRA_SYSTEMS_API_URL || 'http://localhost:4000/',
                    apiKey: organization.apiKey,
                    deviceId: organization.deviceId,
                    deviceName: '',
                    status: 'disconnected'
                };

                await UmbraSystemsConfig.create(defaultConfig)
            }

            if(resetData) {
                await resetCollections('admin')
            }

            return res.status(200).json({
                message: 'Organization enabled successfully',
                data: organization
            });
        }else if (action === "Disabled"){
            const organization = await DemoOrganization.findByIdAndUpdate(organizationId, { status: 'Disabled' }, { new: true });

            const umbraSystemsConfig = await UmbraSystemsConfig.findOne();

            if (umbraSystemsConfig) {
                umbraSystemsConfig.deviceId = '';
                umbraSystemsConfig.apiKey = '';
                umbraSystemsConfig.status = 'disconnected';
                await umbraSystemsConfig.save();
            }

            return res.status(200).json({
                message: 'Organization disabled successfully',
                data: organization
            });
        }

    } catch (err) {
        return res.status(400).json({ message: err.message });
    }
}


exports.deleteOrganization = async (req, res) => {
    const { organizationId } = req.params;

    try {
        await DemoOrganization.findByIdAndDelete(organizationId);
        return res.status(200).json({ message: 'Organization deleted' });
    } catch (err) {
        return res.status(400).json({ message: err.message });
    }
};
