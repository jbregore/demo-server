const express = require('express');
const router = express.Router();

const settings = require('../controllers/settings');

router.get('/', settings.getSettings);
router.patch('/', settings.updateSettings);
router.get('/umbra-systems-config', settings.getUmbraSystemsConfig);
router.patch('/umbra-systems-config', settings.updateUmbraSystemsConfig);
// router.get('/update-backup-database', settings.updateBackupDatabase);
router.post('/reindex-collections', settings.reindexCollections);
// router.post('/add-index', settings.addIndices)
router.delete('/reset-data', settings.resetData);
router.get('/backup-database', settings.backupDatabase);
router.get('/pos-date', settings.getPosDate);

router.post('/init', settings.initCollections)

module.exports = router;
