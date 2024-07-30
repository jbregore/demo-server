const HttpError = require('../../middleware/http-error');
const User = require('../../models/User')

exports.checkSupervisorAccess = async (req, res, next) => {
  const { username, password } = req.body;

  try {
    const supervisor = await User.findOne({
      username,
      password,
      role: 'supervisor',
      isArchive: false
    })

    return res.status(200).json({ data: supervisor })
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};
