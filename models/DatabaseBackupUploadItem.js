const mongoose = require('mongoose');

const DatabaseBackupUploadItem = mongoose.Schema(
  {
    key: {
      type: String,
      required: true
    },
    path: {
      type: String,
      required: true
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('database_backup_upload_item', DatabaseBackupUploadItem);
