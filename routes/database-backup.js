const express = require('express');
const router = express.Router();

const dbBackup = require('../controllers/database-backup');

router.get('/', dbBackup.getBackups);
router.get('/snapshots', dbBackup.getSnapshotsByDate);
router.get('/upload-queue/count', dbBackup.getUploadQueueCount);
router.post('/upload-queue', dbBackup.uploadQueue);
router.post('/backup', dbBackup.backupDatabase);
router.post('/restore', dbBackup.restoreBackup);

module.exports = router;
