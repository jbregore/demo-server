const ssis = require('../config/db/ssis');
const HttpError = require('../middleware/http-error');

exports.get = (req, res, next) => {
  const connection = ssis();

  try {
    connection.query(
      `
        SELECT
            *
        FROM
            _pos_settings
    `,
      function (err, result) {
        if (err) {
          const error = new HttpError('Failed to get company settings, please try again.', 500);
          connection.end();

          return next(error);
        } else {
          connection.end();
          res.status(200).json({ data: result[0] });
        }
      }
    );
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    connection.end();

    return next(error);
  }
};

exports.update = (req, res, next) => {
  const {
    printerName,
    storeCode,
    startingDate,
    nonVat,
    storeName,
    companyName,
    companyAddress1,
    companyAddress2,
    vatReg,
    accr,
    permit,
    snMin,
    activeCategory,
    companyWebsiteLink
  } = req.body;

  const connection = ssis();

  try {
    connection.query(
      `
        UPDATE
            _pos_settings
        SET
            printer_name = '${printerName}',
            store_code = '${storeCode}',
            starting_date = '${startingDate}',
            non_vat = '${nonVat}',
            store_name = '${storeName}',
            company_name = '${companyName}',
            company_address1 = '${companyAddress1}',
            company_address2 = '${companyAddress2}',
            vat_reg = '${vatReg}',
            accr = '${accr}',
            permit = '${permit}',
            sn_min = '${snMin}',
            active_category = '${activeCategory}',
            company_website_link = '${companyWebsiteLink}'
    `,
      function (err, result) {
        if (err) {
          const error = new HttpError('Failed to update company settings, please try again.', 500);
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
