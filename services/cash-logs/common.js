const Counter = require('../../models/Counter');
const Transaction = require('../../models/Transaction');
const moment = require('moment');

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

const getSiNumber = (storeCode, type) => {
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

const formatDate = (dateToParse) => {
  const [date, time] = moment(dateToParse).format('YYYY-MM-DD HH:mm:ss').split(' ');

  return { date, time };
};

const getTotalCount = (cashReport) => {
  const totalCount = {
    peso1000Total: cashReport.peso1000 !== 0 ? cashReport.peso1000 * 1000 : 0,
    peso500Total: cashReport.peso500 !== 0 ? cashReport.peso500 * 500 : 0,
    peso200Total: cashReport.peso200 !== 0 ? cashReport.peso200 * 200 : 0,
    peso100Total: cashReport.peso100 !== 0 ? cashReport.peso100 * 100 : 0,
    peso50Total: cashReport.peso50 !== 0 ? cashReport.peso50 * 50 : 0,
    peso20Total: cashReport.peso20 !== 0 ? cashReport.peso20 * 20 : 0,
    peso10Total: cashReport.peso10 !== 0 ? cashReport.peso10 * 10 : 0,
    peso5Total: cashReport.peso5 !== 0 ? cashReport.peso5 * 5 : 0,
    peso1Total: cashReport.peso1 !== 0 ? cashReport.peso1 * 1 : 0,
    cent25Total: cashReport.cent25 !== 0 ? cashReport.cent25 * 0.25 : 0,
    cent10Total: cashReport.cent10 !== 0 ? cashReport.cent10 * 0.1 : 0,
    cent05Total: cashReport.cent05 !== 0 ? cashReport.cent05 * 0.05 : 0,
    cent01Total: cashReport.cent01 !== 0 ? cashReport.cent01 * 0.01 : 0
  };

  return totalCount;
};

module.exports = {
  getTxnNumber,
  getSiNumber,
  formatDate,
  getTotalCount
};
