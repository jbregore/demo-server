const ssis = require('../config/db/ssis');
const backupDb = require('../config/db/backupDb');
const HttpError = require('../middleware/http-error');
const internetAvailable = require('internet-available');

exports.getCustomerById = (req, res, next) => {
  const { id } = req.query;

  const connection = ssis();
  try {
    connection.query(
      `
				SELECT
					loyalty_points as points,
					first_name as fname,
					last_name as lname
				FROM
					_pos_loyalty_points
				WHERE
					customer_id = '${id}'
			`,
      function (err, result) {
        if (err) {
          const error = new HttpError('Failed to fetch loyalty points, please try again.', 500);
          connection.end();

          return next(error);
        } else {
          connection.end();
          res.status(200).json({ data: result });
        }
      }
    );
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    connection.end();

    return next(error);
  }
};

exports.updateCustomerPoints = (req, res, next) => {
  const { id, newPoints } = req.body;

  const connection = ssis();
  try {
    internetAvailable({
      // Provide maximum execution time for the verification
      timeout: 5000,
      // If it tries 5 times and it fails, then it will throw no internet
      retries: 2
    })
      .then(() => {
        const backupConnection = backupDb();

        backupConnection
          .promise()
          .query(
            `
            UPDATE
              _pos_loyalty_points
            SET
              loyalty_points = '${newPoints}'
            WHERE
              customer_id = '${id}'
          `
          )
          .catch(() => backupConnection.end())
          .then(() => backupConnection.end());
      })
      .catch(() => console.log('No internet'));

    connection.query(
      `
				UPDATE
					_pos_loyalty_points
				SET
					loyalty_points = '${newPoints}'
				WHERE
					customer_id = '${id}'
			`,
      function (err, result) {
        if (err) {
          const error = new HttpError('Failed to use loyalty points, please try again.', 500);
          connection.end();

          return next(error);
        } else {
          connection.end();
          res.status(200).json({ data: result });
        }
      }
    );
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    connection.end();

    return next(error);
  }
};
