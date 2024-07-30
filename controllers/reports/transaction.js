const HttpError = require('../../middleware/http-error');
const moment = require('moment');
const Counter = require('../../models/Counter');
const Transaction = require('../../models/Transaction');

exports.createPosTransaction = async (req, res, next) => {
  const { storeCode, type } = req.body;

  const getTxnNumber = () => {
    return new Promise((resolve, reject) => {
      Counter.findOne({})
        .then(result => {
          const txnNumber = `${result.seq + 1}`.padStart(16, '0');
          resolve(txnNumber);
        })
        .catch(err => {
          console.log(err);
          reject('Failed to count users activity logs, please try again.');
        });
    });
  };

  const getSiNumber = (type) => {
    return new Promise((resolve, reject) => {
      Transaction.find({
        storeCode,
        type: { $in: ['regular', 'return'] }
      })
      .then(result => {
        if (type === 'regular' || type === 'return') {
          const siNumber = `${result.length + 1}`.padStart(16, '0');
          resolve(siNumber);
        } else {
          resolve('');
        }
      })
      .catch(err => {
        console.log(err);
        reject('Failed to count transactions, please try again.');
      });
    });
  };
  

  const insertPosTransaction = (txnNumber, siNumber, data) => {
    const { amount, cashierId, employeeId, type, transactionDate } = data;
    const [txnDate, txnTime] = moment(transactionDate).format('YYYY-MM-DD HH:mm:ss').split(' ');

    return new Promise((resolve, reject) => {
      const newTransaction = new Transaction({
        amount,
        employeeId: employeeId || cashierId,
        storeCode,
        type,
        txnNumber,
        siNumber,
        transactionDate: new Date(`${txnDate}T${txnTime}Z`)
      });
    
      newTransaction.save()
        .then(() => {
          resolve({ txnNumber, siNumber });
        })
        .catch(err => {
          console.log(err);
          reject('Failed to create pos transaction, please try again.');
        });
    });
    
  };

  try {
    const [txnNumber, siNumber] = await Promise.all([
      getTxnNumber(),
      getSiNumber(type),
    ]);

    const result = await insertPosTransaction(txnNumber, siNumber, req.body);
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    const error = new HttpError(err, 500);
    return next(error);
  }
};
