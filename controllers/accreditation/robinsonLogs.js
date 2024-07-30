const RobinsonLogs = require('../../models/RobinsonLogs');
const HttpError = require('../../middleware/http-error');
const backupDb = require('../../config/db/backupDb')
const internetAvailable = require('internet-available')

exports.createLogs = async (req, res, next) => {
  const { storeCode, transactionDate } = req.body;

  // check for existing
  let isExist;
  try {
    isExist = await RobinsonLogs.findOne({ transactionDate });
  } catch (err) {
    const error = new HttpError('Something went wrong while fetching data, please try again.', 500);
    return next(error);
  }

  if (isExist) {
    return res.status(200).json({ message: 'data already exist.' });
  }

  const createdLogs = new RobinsonLogs({
    transactionDate,
    storeCode,
    batchNumber: 1
  });

  try {
    const backupConnection = backupDb()

    const query = `INSERT INTO _pos_robinson_logs (
        id,
        transaction_date,
        preview_document,
        store_code
      ) VALUES (
        ${backupConnection.escape(createdLogs._id.toString())},
        DATE('${transactionDate}'),
        '${JSON.stringify(createdLogs)}',
        ${storeCode} 
      ) ON DUPLICATE KEY UPDATE 
        id = VALUES(id),
        transaction_date = VALUES(transaction_date),
        preview_document = VALUES(preview_document),
        store_code = VALUES(store_code)
    `

    internetAvailable({
      // Provide maximum execution time for the verification
      timeout: 5000,
      // If it tries 5 times and it fails, then it will throw no internet
      retries: 2
    }).then(async () => {
      await promisifyQuery(backupConnection, query)
    }).catch(() => {
      console.log("No internet");
    });
    await createdLogs.save()

  } catch (err) {
    console.log(err)
    const error = new HttpError('Creating logs failed, please try again.', 500);
    return next(error);
  }

  res.status(201).json({ data: createdLogs });
};

exports.getLogsByStoreCode = async (req, res, next) => {
  const { storeCode, transactionDate } = req.params;

  let logs = false;
  try {
    logs = await RobinsonLogs.findOne({
      storeCode,
      transactionDate
    });
  } catch (err) {
    const error = new HttpError('Something went wrong while fetching logs, please try again.', 500);
    return next(error);
  }

  if (!logs) {
    const error = new HttpError('No logs found.', 404);
    return next(error);
  }

  res.status(200).json({ data: logs });
};

exports.updateBatchNumber = async (req, res, next) => {
  const { storeCode, transactionDate } = req.params;
  const { batchNumber } = req.body;

  // check for existing
  let isExist;
  try {
    isExist = await RobinsonLogs.findOne({ transactionDate });
  } catch (err) {
    const error = new HttpError('Something went wrong while fetching data, please try again.', 500);
    return next(error);
  }

  if (!isExist) {
    const error = new HttpError('Logs not found.', 404);
    return next(error);
  }

  // update the batch counter
  let updatedBatch;
  try {
    updatedBatch = await RobinsonLogs.updateOne(
      { transactionDate, storeCode },
      { $set: { batchNumber } }
    );
  } catch (err) {
    const error = new HttpError('Something went wrong while updating data, please try again.', 500);
    return next(error);
  }

  if (!updatedBatch) {
    const error = new HttpError('Failed to update data, please try again.', 500);
    return next(error);
  }

  res.status(200).json({ data: updatedBatch });
};

exports.saveReprint = async (req, res, next) => {
  const { storeCode, transactionDate } = req.params;
  const { type, siNumber, amount } = req.body;

  // check for existing
  let logsExist;
  try {
    logsExist = await RobinsonLogs.findOne({ transactionDate, storeCode });
  } catch (err) {
    const error = new HttpError('Something went wrong while fetching data, please try again.', 500);
    return next(error);
  }

  if (!logsExist) {
    const error = new HttpError('Logs not found.', 404);
    return next(error);
  }

  // update list
  logsExist.reprint.push({ type, siNumber, amount });

  // save list
  try {
    await logsExist.save();
  } catch (err) {
    const error = new HttpError('Updating reprint logs failed, please try again.', 500);
    return next(error);
  }

  res.status(200).json({ data: logsExist });
};

const promisifyQuery = (connection, query) => {
  return new Promise((resolve, reject) => {
    connection.query(query, (err, result) => {
      connection.end()

      if (err) {
        console.log(err)
        return reject(err)
      }
      resolve(result)
    });
  });
}