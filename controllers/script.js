const Preview = require('../models/Preview');
const HttpError = require('../middleware/http-error');
const ssis = require('../config/db/ssis');

exports.getIncorrectData = async (req, res, next) => {
  const { transactionDate } = req.params;

  const connection = ssis();
  // grab all items with price override
  let overridedPrice = [];
  try {
    const res = await Preview.find({
      'data.cart.confirmOrders.ordersSpecs.overridedPrice': { $exists: true },
      transactionDate: new RegExp('.*' + transactionDate + '.*')
    }).maxTimeMS(300000);

    if (res.length) {
       
      res.map((x) => {
         
        x.data.cart.confirmOrders[0].ordersSpecs.map((y) => {
          if (y.overridedPrice) {
            overridedPrice.push({
              id: y.ordersSpecsId,
              poNumber: y.poNumber,
              price: y.overridedPrice
            });
          }
        });
      });
    }
  } catch (err) {
    const error = new HttpError('Fetching preview data failed, please try again.', 500);
    return next(error);
  }

  // grab mysql database
  try {
     
    overridedPrice.forEach((line) => {
      let vatAmount = Number(line.price) - Number(line.price) / 1.12;
      connection.query(
        `UPDATE _pos_specs SET price = ${connection.escape(
          line.price
        )}, vat_amount = ${connection.escape(vatAmount)} WHERE po_number = '${
          line.poNumber
        }' AND orders_specs_id = '${line.id}' AND price != '${line.price}'`,
        function (err) {
          if (err) {
            const error = new HttpError('Updating orders data failed, please try again.', 500);
            connection.end();

            return next(error);
          }
        }
      );

      connection.query(
        `UPDATE _pos_sunniess_sl SET net_price = ${connection.escape(
          line.price
        )} WHERE po_number = '${line.poNumber}' AND net_price != '${line.price}'`,
        function (err) {
          if (err) {
            const error = new HttpError('Updating SL data failed, please try again.', 500);
            connection.end();

            return next(error);
          }
        }
      );
    });
    connection.end();
  } catch (err) {
    const error = new HttpError('Fetching preview data failed, please try again.', 500);
    return next(error);
  }

  res.status(200).json({ data: 'success' });
};
