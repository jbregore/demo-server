const ActivityLog = require('../../models/ActivityLog');
const CashLog = require('../../models/CashLog');

exports.getOnlineCashiers = async (req, res, next) => {
  try {
    const { branchCode, transactionDate } = req.params;

    const cashierData = await CashLog.aggregate([
      {
        $match: {
          branchCode: branchCode,
          type: 'initial',
          cashDate: {
            $gte: new Date(`${transactionDate}T00:00:00Z`),
            $lte: new Date(`${transactionDate}T23:59:59Z`)
          }
        }
      },
      {
        $project: {
          _id: 0,
          cashier_id: '$employeeId',
          cashier_first_name: '$cashierFirstName',
          cashier_last_name: '$cashierLastName',
          total: 1
        }
      }
    ])

    const xReadData = await ActivityLog.aggregate([
      {
        $match: {
          storeCode: branchCode,
          action: 'X Read',
          activityDate: {
            $gte: new Date(`${transactionDate}T00:00:00Z`),
            $lte: new Date(`${transactionDate}T23:59:59Z`)
          }
        }
      },
      {
        $group: {
          _id: '$employeeId'
        }
      },
      {
        $project: {
          _id: 0,
          employee_id: '$_id'
        }
      }
    ])

    return res.status(200).json({
      cashierData: cashierData,
       xReadData
    });

  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
