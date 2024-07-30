const mongoose = require('mongoose');

const DatabaseBackupState = mongoose.Schema(
  {
    dailyBackupIndex: {
      type: Number,
      required: true
    },
    mongoDbDumpIndex: {
      type: Number,
      required: true
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('database_backup_state', DatabaseBackupState);
