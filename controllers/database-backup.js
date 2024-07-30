const moment = require('moment');
const backupDbScript = require('../scripts/backup-database');
const HttpError = require('../middleware/http-error');

exports.getBackups = async (req, res, next) => {
  try {
    const data = await backupDbScript.getBackupFiles();
    let dates = [];
    data.Contents?.forEach((file) => {
      const newDate = file.Key.split('/')[4];
      const existingDate = dates.find((d) => d.date === newDate);
      if (!existingDate) {
        dates.push({
          date: newDate,
          lastModified: file.LastModified
        });
      } else if (file.LastModified > existingDate.lastModified) {
        existingDate.lastModified = file.LastModified;
      }
    });

    dates.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json(dates);
  } catch (err) {
    console.log(err);
    const error = new HttpError(err, req, 'Failed to fetch data, please try again.', 500);
    return next(error);
  }
};

exports.getSnapshotsByDate = async (req, res, next) => {
  const { date } = req.query;

  if (!date) {
    const error = new HttpError('Date is required.', req, 'Date is required.', 400);
    return next(error);
  }

  try {
    const data = await backupDbScript.getBackupFiles(date);
    const mongoSnapshots = [];

    for (const file of data.Contents) {
      const key = file.Key.split('/');
      const type = key[6];

      if (type === 'mongodb') {
        const exists = mongoSnapshots.find(
          (s) => s.folderName === key[7] && s.dailyBackupIndex === key[5]
        );

        if (exists) {
          if (file.LastModified > exists.timestamp) {
            exists.timestamp = file.LastModified;
          }
        } else {
          mongoSnapshots.push({
            timestamp: file.LastModified,
            folderName: key[7],
            dailyBackupIndex: key[5]
          });
        }
      }
    }

    mongoSnapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json({ mongoDb: mongoSnapshots });
  } catch (err) {
    console.log(err);
    const error = new HttpError(err, req, 'Failed to fetch data, please try again.', 500);
    return next(error);
  }
};

exports.backupDatabase = async (req, res, next) => {
  try {
    const todayBackupFiles = await backupDbScript.getBackupFiles(
      moment().format('YYYY-MM-DD'),
      '000',
      'mongodb'
    );
    if (todayBackupFiles.KeyCount === 0) {
      await backupDbScript.updateDbBackupState({
        dailyBackupIndex: 0,
        mongoDbDumpIndex: 0
      });
    }

    await backupDbScript.backupMongoDb();

    return res.status(200).json({ message: 'Database backed up successfully.' });
  } catch (err) {
    console.log(err);
    const error = new HttpError(err, req, 'Failed to backup database, please try again.', 500);
    return next(error);
  }
};

exports.restoreBackup = async (req, res, next) => {
  const { action } = req.body;

  try {
    const { timestamp, restorePoint } = req.body;
    const date = moment(timestamp).format('YYYY-MM-DD');

    if (action === 'full') {
      await backupDbScript.restoreBackup(date, restorePoint);
      await backupDbScript.incrementBackupIndex();
      return res.status(200).json({ message: 'Database restored successfully.' });
    }

    if (action === 'partial') {
      const { collections } = req.body;
      await backupDbScript.restoreBackup(date, restorePoint, { collections });
      await backupDbScript.incrementBackupIndex();
      return res.status(200).json({ message: 'Database restored successfully.' });
    }
  } catch (err) {
    console.log(err);
    const error = new HttpError(err, req, 'Failed to restore backup, please try again.', 500);
    return next(error);
  }
};

exports.getUploadQueueCount = async (req, res, next) => {
  try {
    const count = await backupDbScript.getUploadQueueCount();
    res.status(200).json({ count });
  } catch (err) {
    console.log(err);
    const error = new HttpError(err, req, 'Failed to fetch data, please try again.', 500);
    return next(error);
  }
};

exports.uploadQueue = async (req, res, next) => {
  try {
    const success = await backupDbScript.uploadQueue();

    if (!success) {
      throw new Error('Failed to execute upload queue.');
    }

    res.status(200).json({ message: 'Upload queue executed successfully.' });
  } catch (err) {
    console.log(err);
    const error = new HttpError(
      err,
      req,
      'There was an error uploading backup queue, please try again.',
      500
    );
    return next(error);
  }
};
