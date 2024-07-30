const HttpError = require('../../middleware/http-error');
const ResetCountLog = require('../../models/ResetCountLog')

exports.createResetCountLog = async (req, res, next) => {
  const { resetCountLogId, storeCode, resetDate } = req.body;
  const [date, time] = resetDate.split(' ')
  
  try { 
    const newResetCountLog = new ResetCountLog(
      {
        resetCountLogId,
        lastStoreCode: storeCode,
        resetDate: new Date(`${date}T${time}Z`)
      }
    )

    await newResetCountLog.save()

    return res.status(200).json({message: 'Created.'})
  } catch (err) {
    console.log(err)
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.getResetCount = async (req, res, next) => {
  const { storeCode } = req.params;

  try {
    const [resetCount] = await ResetCountLog.aggregate(
      [
        {
          $match: {
            lastStoreCode: storeCode
          }
        },
        {
          $count: 'count'
        }
      ])

      console.log(`Reset count is `, resetCount)
      return res.status(200).json({resetCount: resetCount})
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};
