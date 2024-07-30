const Counter = require('../../models/Counter')
const Transaction = require('../../models/Transaction')

const getTxnNumber = () => {
    return new Promise((resolve, reject) => {
        Counter.findOne({ _id: 'activityNumber' })
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

const getSiNumber = (type, returnSiNumber, refundSiNumber) => {
    return new Promise((resolve, reject) => {
        Transaction.find({ type: 'regular' })
            .then(result => {
                let siNumber;
                switch (type) {
                    case 'regular':
                        siNumber = `${result.length + 1}`.padStart(16, '0');
                        break;
                    case 'return':
                        siNumber = returnSiNumber;
                        break;
                    case 'refund':
                        siNumber = refundSiNumber;
                        break;
                    default:
                        siNumber = '';
                        break;
                }
                resolve(siNumber);
            })
            .catch(() => {
                reject('Failed to count transactions, please try again.');
            });
    });
};

const getVoidNumber = (type) => {
    return new Promise((resolve, reject) => {
        Transaction.find({ type: 'void' })
            .then(result => {
                let voidNumber = '';
                if (type === 'void') {
                    voidNumber = `${result.length + 1}`.padStart(16, '0');
                }
                resolve(voidNumber);
            })
            .catch(() => {
                reject('Failed to count void, please try again.');
            });
    });
};

const generateNextActivityNumber = () => {
    return new Promise((resolve, reject) => {
        Counter.findOneAndUpdate(
            { _id: 'activityNumber' },
            { $inc: { seq: 1 } },
            { new: true }
        )
            .then(next => {
                if (!next) {
                    return Counter.create({ _id: 'activityNumber', seq: 0 });
                }
                return next;
            })
            .then(result => {
                resolve(result.seq);
            })
            .catch(err => {
                reject(err);
            });
    });
};


module.exports = {
    getSiNumber,
    getVoidNumber,
    getTxnNumber,
    generateNextActivityNumber
}