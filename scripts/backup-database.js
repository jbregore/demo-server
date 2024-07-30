const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const DatabaseBackupState = require('../models/DatabaseBackupState');
const DatabaseBackupUploadItem = require('../models/DatabaseBackupUploadItem');
const UmbraSystemsConfig = require('../models/UmbraSystemsConfig');
const os = require('os');

const documentsDir = path.join(os.homedir(), 'Documents')

require('dotenv').config({
  path: path.join(__dirname, `..`, `.env`)
});


const s3Client = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT,
  forcePathStyle: false,
  region: 'sgp1',
  credentials: {
    accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID,
    secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY
  }
});

const getUmbraSystemsDeviceId = async () => {
  let umbraSystemsConfig = await UmbraSystemsConfig.find();

  if (umbraSystemsConfig.length < 1) {
    const defaultConfig = {
      endpoint: process.env.UMBRA_SYSTEMS_API_URL || 'http://localhost:4000/',
      apiKey: null,
      deviceId: null,
      deviceName: '',
      status: 'disconnected'
    };
    umbraSystemsConfig = new UmbraSystemsConfig(defaultConfig);
    await umbraSystemsConfig.save();
  } else {
    umbraSystemsConfig = umbraSystemsConfig[0];
  }

  return umbraSystemsConfig.deviceId;
};

const getDbBackupState = async () => {
  let dbBackupState = await DatabaseBackupState.find();

  if (dbBackupState.length < 1) {
    const initialState = {
      dailyBackupIndex: 0,
      mongoDbDumpIndex: 0
    };
    dbBackupState = new DatabaseBackupState(initialState);
    await dbBackupState.save();
  } else {
    dbBackupState = dbBackupState[0];
  }

  return dbBackupState;
};

const updateDbBackupState = async (newState) => {
  const dbBackupState = await getDbBackupState();

  for (const key of Object.keys(newState)) {
    dbBackupState[key] = newState[key];
  }

  await dbBackupState.save();
};

const incrementBackupIndex = async () => {
  const dbBackupState = await getDbBackupState();

  dbBackupState.dailyBackupIndex += 1;
  dbBackupState.mongoDbDumpIndex = 0;

  await dbBackupState.save();
};

const addToUploadQueue = async (item) => {
  const uploadItem = new DatabaseBackupUploadItem(item);
  await uploadItem.save();
};

const getUploadQueue = async () => {
  const uploadQueue = await DatabaseBackupUploadItem.find();
  return uploadQueue;
};

const removeFromUploadQueue = async (key) => {
  await DatabaseBackupUploadItem.deleteOne({ key });
};


const backupMongoDb = async () => {
  const deviceId = await getUmbraSystemsDeviceId();
  const dbBackupState = await getDbBackupState();

  let stdout = execSync('where /R "C:\\Program Files\\MongoDB" mongodump.exe');
  const mongodump = `${stdout.toString().split('\r\n')[0]}`;

  const dbName = process.env.MONGODB_DB_NAME;
  const dumpIndex = String(dbBackupState.mongoDbDumpIndex).padStart(5, '0');
  const dumpName = `mongodb-dump-${dumpIndex}-${moment().format('YYYY-MM-DD-HH-mm-ss')}`;
  const dumpPath = path.join(documentsDir, 'UMBRA_POS_BACKUP', dumpName);

  if (!fs.existsSync(dumpPath)) {
    fs.mkdirSync(dumpPath, { recursive: true });
  }

  console.log('Running full database backup...');
  const dumpCommand = `"${mongodump}" --db ${dbName} --excludeCollectionsWithPrefix=umbra_systems --excludeCollectionsWithPrefix=database_backup --out "${dumpPath}"`;
  stdout = execSync(dumpCommand);
  console.log(stdout.toString());

  const dailyBackupIndex = String(dbBackupState.dailyBackupIndex).padStart(3, '0');
  const uploadKey = `${deviceId}/${moment().format(
    'YYYY-MM-DD'
  )}/${dailyBackupIndex}/mongodb/${dumpName}/${dbName}`;

  const files = fs.readdirSync(path.join(dumpPath, dbName));
  for (const fileName of files) {
    const filePath = path.join(dumpPath, dbName, fileName);
    const uploadItem = {
      key: `${uploadKey}/${fileName}`,
      path: filePath
    };

    const res = await uploadObject(uploadItem);
    if (!res) {
      await addToUploadQueue(uploadItem);
    }
  }

  await updateDbBackupState({ mongoDbDumpIndex: dbBackupState.mongoDbDumpIndex + 1 });
};

const restoreMongoDb = async (backupPath, collections) => {
  const dbName = process.env.MONGODB_DB_NAME;
  const stdout = execSync('where /R "C:\\Program Files\\MongoDB" mongorestore.exe');
  const mongorestore = `${stdout.toString().split('\r\n')[0]}`;

  let nsInclude = `--nsInclude="${dbName}.*"`;
  if (collections) {
    nsInclude = collections.map((collection) => `--nsInclude="${dbName}.${collection}"`).join(' ');
  }

  const restoreCommand = `"${mongorestore}" --drop ${nsInclude} "${path.resolve(backupPath)}"`;
  console.log(restoreCommand);
  const stdout2 = execSync(restoreCommand);
  console.log(stdout2.toString());
};

const uploadObject = async ({ key, path }) => {
  try {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: 'umbra-digital',
        Key: `umbra-pos/backup/clients/${key}`,
        ACL: 'private',
        Body: fs.createReadStream(path)
      }
    });
    console.log('Uploading object: ' + key);
    upload.on('httpUploadProgress', (progress) => {
      console.log(`Progress: ${progress.loaded} / ${progress.total}`);
    });

    const result = await upload.done();
    console.log('Successfully uploaded object: ' + key);
    return result;
  } catch (error) {
    console.log('Error', error);
  }
};

const getObject = async (key, downloadDir = '') => {
  const params = {
    Bucket: 'umbra-digital',
    Key: key
  };

  try {
    const data = await s3Client.send(new GetObjectCommand(params));
    console.log('Successfully downloaded object: ' + params.Bucket + '/' + params.Key);
    const keyDirs = key.split('/');
    const fileName = keyDirs.pop();

    const dest = path.join(
      documentsDir,
      'UMBRA_POS_DOWNLOADS',
      downloadDir || keyDirs.join('/')
    );

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      data.Body.pipe(fs.createWriteStream(path.join(dest, fileName), { flags: 'w' }))
        .on('finish', () => {
          resolve(data);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  } catch (error) {
    console.log('Error', error);
  }
};

const listObjects = async (prefix = '') => {
  const params = {
    Bucket: 'umbra-digital',
    Prefix: prefix
  };

  const command = new ListObjectsV2Command(params);
  const response = await s3Client.send(command);

  return response;
};

const deleteObjects = async (keys) => {
  const params = {
    Bucket: 'umbra-digital',
    Delete: {
      Objects: keys.map((key) => {
        return { Key: key };
      })
    }
  };

  const command = new DeleteObjectsCommand(params);
  const response = await s3Client.send(command);

  return response;
};

const getUploadQueueCount = async () => {
  const queue = await getUploadQueue();

  if (!queue) {
    return 0;
  }

  return queue.length;
};

const uploadQueue = async () => {
  const queue = await getUploadQueue();

  if (!queue || queue.length === 0) {
    console.log('No files to upload. Upload queue is empty.');
    return false;
  }

  try {
    for (const item of queue) {
      const result = await uploadObject(item);

      if (result) {
        await removeFromUploadQueue(item.key);
      }
    }

    return true;
  } catch (error) {
    console.log('Error', error);
    return false;
  }
};

const getBackupFiles = async (date, dailyBackupIndex = '', type = '', path = '') => {
  const deviceId = await getUmbraSystemsDeviceId();

  const params = {
    Bucket: 'umbra-digital',
    Prefix: `umbra-pos/backup/clients/${deviceId}`
  };

  if (date) {
    params.Prefix += `/${date}`;
    if (dailyBackupIndex) {
      params.Prefix += `/${dailyBackupIndex}`;
      if (type) {
        params.Prefix += `/${type}`;
        if (path) {
          params.Prefix += `/${path}`;
        }
      }
    }
  }

  const command = new ListObjectsV2Command(params);
  const response = await s3Client.send(command);

  return response;
};

const restoreBackup = async (date, restorePoint, selection) => {
  const dbName = process.env.MONGODB_DB_NAME;
  const mongoDbFiles = await getBackupFiles(
    date,
    restorePoint.mongoDb.dailyBackupIndex,
    'mongodb',
    restorePoint.mongoDb.folderName
  );

  // download mongodb backup files
  if (!selection || selection.collections.length > 0) {
    for (const file of mongoDbFiles.Contents) {
      const downloadDir = `backup/${date}/mongodb/${restorePoint.mongoDb.folderName}/${dbName}`;
      await getObject(file.Key, downloadDir);
    }
  }

  const downloadPath = path.join(documentsDir, 'UMBRA_POS_DOWNLOADS', `backup/${date}`);
  const mongoDbDumpPath = path.join(downloadPath, 'mongodb', restorePoint.mongoDb.folderName);

  if (!selection) {
    // full restore
    await restoreMongoDb(mongoDbDumpPath);
  } else {
    // partial restore
    const { collections } = selection;

    if (collections.length > 0) {
      await restoreMongoDb(mongoDbDumpPath, collections);
    }
  }

  // delete downloaded files
  fs.rmSync(downloadPath, { recursive: true });
};

module.exports = {
  backupMongoDb,
  restoreMongoDb,
  uploadObject,
  getObject,
  listObjects,
  deleteObjects,
  getUploadQueueCount,
  uploadQueue,
  getUmbraSystemsDeviceId,
  updateDbBackupState,
  getBackupFiles,
  restoreBackup,
  incrementBackupIndex
};
