const ssis = require('../../config/db/ssis');
const backupDb = require('../../config/db/backupDb');
const HttpError = require('../../middleware/http-error');
const Excel = require('exceljs');
const path = require('path');
// const AdmZip = require('adm-zip');
const Client = require('ftp');
const session = require('express-session');
const fs = require('fs');
const internetAvailable = require('internet-available');
const os = require('os');

const documentsDir = path.join(os.homedir(), 'Documents')

exports.createSl = async (req, res, next) => {
  const {
    sunniessSlId,
    postingDate,
    invoiceNo,
    lineNo,
    itemCode,
    description,
    taxCode,
    quantity,
    grossPrice,
    netPrice,
    discountType,
    discountPercentage,
    discountAmount,
    globalDiscountType,
    globalDiscountPercentage,
    globalDiscountAmount,
    salesAttendant,
    cashier,
    doctor,
    timestamp,
    customerName,
    companyCode,
    storeCode,
    specsSalesType,
    specsFromWarehouse,
    poNumber,
    status
  } = req.body;

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
            INSERT INTO
                _pos_sunniess_sl
            (
                sunniess_sl_id,
                posting_date,
                invoice_no,
                line_no,
                item_code,
                description,
                tax_code,
                quantity,
                gross_price,
                net_price,
                discount_type,
                discount_percentage,
                discount_amount,
                global_discount_type,
                global_discount_percentage,
                global_discount_amount,
                sales_attendant,
                cashier,
                doctor,
                timestamp,
                customer_name,
                company_code,
                store_code,
                specs_sales_type,
                specs_from_warehouse,
                po_number,
                status
            )
            VALUES
            (
                ${backupConnection.escape(sunniessSlId)},
                ${backupConnection.escape(postingDate)},
                ${backupConnection.escape(invoiceNo)},
                ${backupConnection.escape(lineNo)},
                ${backupConnection.escape(itemCode)},
                ${backupConnection.escape(description)},
                ${backupConnection.escape(taxCode)},
                ${backupConnection.escape(quantity)},
                ${backupConnection.escape(grossPrice)},
                ${backupConnection.escape(netPrice)},
                ${backupConnection.escape(discountType)},
                ${backupConnection.escape(discountPercentage)},
                ${backupConnection.escape(discountAmount)},
                ${backupConnection.escape(globalDiscountType)},
                ${backupConnection.escape(globalDiscountPercentage)},
                ${backupConnection.escape(globalDiscountAmount)},
                ${backupConnection.escape(salesAttendant)},
                ${backupConnection.escape(cashier)},
                ${backupConnection.escape(doctor)},
                ${backupConnection.escape(timestamp)},
                ${backupConnection.escape(customerName)},
                ${backupConnection.escape(companyCode)},
                ${backupConnection.escape(storeCode)},
                ${backupConnection.escape(specsSalesType)},
                ${backupConnection.escape(specsFromWarehouse)},
                ${backupConnection.escape(poNumber)},
                ${backupConnection.escape(status)}
            )
        `
          )
          .catch(() => backupConnection.end())
          .then(() => backupConnection.end());
      })
      .catch(() => console.log('No internet'));

    connection.query(
      `
        INSERT INTO
            _pos_sunniess_sl
        (
            sunniess_sl_id,
            posting_date,
            invoice_no,
            line_no,
            item_code,
            description,
            tax_code,
            quantity,
            gross_price,
            net_price,
            discount_type,
            discount_percentage,
            discount_amount,
            global_discount_type,
            global_discount_percentage,
            global_discount_amount,
            sales_attendant,
            cashier,
            doctor,
            timestamp,
            customer_name,
            company_code,
            store_code,
            specs_sales_type,
            specs_from_warehouse,
            po_number,
            status
        )
        VALUES
        (
            ${connection.escape(sunniessSlId)},
            ${connection.escape(postingDate)},
            ${connection.escape(invoiceNo)},
            ${connection.escape(lineNo)},
            ${connection.escape(itemCode)},
            ${connection.escape(description)},
            ${connection.escape(taxCode)},
            ${connection.escape(quantity)},
            ${connection.escape(grossPrice)},
            ${connection.escape(netPrice)},
            ${connection.escape(discountType)},
            ${connection.escape(discountPercentage)},
            ${connection.escape(discountAmount)},
            ${connection.escape(globalDiscountType)},
            ${connection.escape(globalDiscountPercentage)},
            ${connection.escape(globalDiscountAmount)},
            ${connection.escape(salesAttendant)},
            ${connection.escape(cashier)},
            ${connection.escape(doctor)},
            ${connection.escape(timestamp)},
            ${connection.escape(customerName)},
            ${connection.escape(companyCode)},
            ${connection.escape(storeCode)},
            ${connection.escape(specsSalesType)},
            ${connection.escape(specsFromWarehouse)},
            ${connection.escape(poNumber)},
            ${connection.escape(status)}
        )
    `,
      function (err, result) {
        if (err) {
          const error = new HttpError('Failed to create SL report, please try again.', 500);
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

exports.createSlAll = async (req, res, next) => {
  const { reports } = req.body;
  const backup = req.query.backup || false;

  if (!backup) {

    try {
      reports.forEach((item,) => {
        const connection = ssis();

        // escape the strings in the object using the mysql.escape function
        const escItem = Object.keys(item).reduce((obj, key) => {
          obj[key] = connection.escape(item[key]);
          return obj;
        }, {});

        connection.query(
          `
              INSERT INTO
                  _pos_sunniess_sl
              (
                  sunniess_sl_id,
                  posting_date,
                  invoice_no,
                  line_no,
                  item_code,
                  description,
                  tax_code,
                  quantity,
                  gross_price,
                  net_price,
                  discount_type,
                  discount_percentage,
                  discount_amount,
                  global_discount_type,
                  global_discount_percentage,
                  global_discount_amount,
                  sales_attendant,
                  cashier,
                  doctor,
                  timestamp,
                  customer_name,
                  company_code,
                  store_code,
                  specs_sales_type,
                  specs_from_warehouse,
                  po_number,
                  status
              )
              VALUES
              (
                  ${escItem.sunniessSlId},
                  ${escItem.postingDate},
                  ${escItem.invoiceNo},
                  ${escItem.lineNo},
                  ${escItem.itemCode},
                  ${escItem.description},
                  ${escItem.taxCode},
                  ${escItem.quantity},
                  ${escItem.grossPrice},
                  ${escItem.netPrice},
                  ${escItem.discountType},
                  ${escItem.discountPercentage},
                  ${escItem.discountAmount},
                  ${escItem.globalDiscountType},
                  ${escItem.globalDiscountPercentage},
                  ${escItem.globalDiscountAmount},
                  ${escItem.salesAttendant},
                  ${escItem.cashier},
                  ${escItem.doctor},
                  ${escItem.timestamp},
                  ${escItem.customerName},
                  ${escItem.companyCode},
                  ${escItem.storeCode},
                  ${escItem.specsSalesType},
                  ${escItem.specsFromWarehouse},
                  ${escItem.poNumber},
                  ${escItem.status}
              )
          `,
          function (err) {
            if (err) {
              const error = new HttpError(
                'Failed to create multiple SL report, please try again.',
                500
              );
              connection.end();

              return next(error);
            } else {
              connection.end();
            }
          }
        );
      });
    } catch (err) {
      const error = new HttpError('Something went wrong, please try again.', 500);

      return next(error);
    } finally {
      res.status(201).json({ data: 'OK' });
    }
  } else {
    internetAvailable({
      // Provide maximum execution time for the verification
      timeout: 5000,
      // If it tries 5 times and it fails, then it will throw no internet
      retries: 2
    })
      .then(async () => {
        const allSlPromises = reports.map((item,) => {
          const backupConnection = backupDb().promise();

          // escape the strings in the object using the mysql.escape function
          const escItem = Object.keys(item).reduce((obj, key) => {
            obj[key] = backupConnection.escape(item[key]);
            return obj;
          }, {});

          return backupConnection.query(
            `
              INSERT INTO
                  _pos_sunniess_sl
              (
                  sunniess_sl_id,
                  posting_date,
                  invoice_no,
                  line_no,
                  item_code,
                  description,
                  tax_code,
                  quantity,
                  gross_price,
                  net_price,
                  discount_type,
                  discount_percentage,
                  discount_amount,
                  global_discount_type,
                  global_discount_percentage,
                  global_discount_amount,
                  sales_attendant,
                  cashier,
                  doctor,
                  timestamp,
                  customer_name,
                  company_code,
                  store_code,
                  specs_sales_type,
                  specs_from_warehouse,
                  po_number,
                  status
              )
              VALUES
              (
                  ${escItem.sunniessSlId},
                  ${escItem.postingDate},
                  ${escItem.invoiceNo},
                  ${escItem.lineNo},
                  ${escItem.itemCode},
                  ${escItem.description},
                  ${escItem.taxCode},
                  ${escItem.quantity},
                  ${escItem.grossPrice},
                  ${escItem.netPrice},
                  ${escItem.discountType},
                  ${escItem.discountPercentage},
                  ${escItem.discountAmount},
                  ${escItem.globalDiscountType},
                  ${escItem.globalDiscountPercentage},
                  ${escItem.globalDiscountAmount},
                  ${escItem.salesAttendant},
                  ${escItem.cashier},
                  ${escItem.doctor},
                  ${escItem.timestamp},
                  ${escItem.customerName},
                  ${escItem.companyCode},
                  ${escItem.storeCode},
                  ${escItem.specsSalesType},
                  ${escItem.specsFromWarehouse},
                  ${escItem.poNumber},
                  ${escItem.status}
              )
          `
          ).then(() => backupConnection.end())
            .catch(() => backupConnection.end());
        });

        try {
          await Promise.all(allSlPromises);
          res.status(201).json({ data: 'OK' });
        } catch (err) {
          const error = new HttpError(
            'Failed to create a multiple backup of SL report, please try again.',
            500
          );
          return next(error);
        }

      });
  }
};

exports.getSlReport = async (req, res, next) => {
  const { transactionDate } = req.params;

  const test = {
    optical: {
      folder: 'OPTICAL',
      spCode: 'SP'
    },
    sun: {
      folder: 'STUDIOS',
      spCode: 'SS'
    },
    face: {
      folder: 'FACE',
      spCode: 'SF'
    }
  };

  const connection = ssis();
  try {
    connection.query(
      `
            SELECT
                *
            FROM
                _pos_sunniess_sl
            WHERE
                DATE(posting_date) = DATE('${transactionDate}')
            AND
                status IN ('paid', 'return')
            ORDER BY
                invoice_no, line_no
        `,
      function (err, result) {
        if (err) {
          const error = new HttpError('Failed to get SL report, please try again.', 500);
          connection.end();

          return next(error);
        } else {
          const rows = [];

          if (result?.length === 0) {
            connection.end();
            return res.status(204).json({ message: 'No SL reports for this date' });
          }

          result.forEach((node) => {
            let postDate = new Date(node.posting_date);
            postDate = `${postDate.getMonth() + 1}/${postDate.getDate()}/${postDate.getFullYear()}`;

            rows.push({
              postingDate: postDate,
              invoiceNo: node.invoice_no,
              lineNo: node.line_no,
              itemCode: node.item_code,
              description: node.description,
              taxCode: node.tax_code,
              quantity: node.quantity,
              grossPrice: node.gross_price,
              netPrice: node.net_price,
              discountType: node.discount_type,
              discountPercentage: node.discount_percentage,
              discountAmount: node.discount_amount,
              globalDiscountType: node.global_discount_type,
              globalDiscountPercentage: node.global_discount_percentage,
              globalDiscountAmount: node.global_discount_amount,
              salesAttendant: node.sales_attendant,
              cashier: node.cashier,
              doctor: node.doctor,
              timestamp: node.timestamp,
              customerName: node.customer_name,
              companyCode: node.company_code,
              storeCode: node.store_code,
              specsSalesType: node.specs_sales_type,
              specsFromWarehouse: node.specs_from_warehouse,
              poNumber: node.po_number
            });
          });

          const workbook = new Excel.Workbook();
          const worksheet = workbook.addWorksheet('SL');

          worksheet.columns = [
            {
              key: 'postingDate'
            },
            {
              key: 'invoiceNo'
            },
            {
              key: 'lineNo'
            },
            {
              key: 'itemCode'
            },
            {
              key: 'description'
            },
            {
              key: 'taxCode'
            },
            {
              key: 'quantity'
            },
            {
              key: 'grossPrice'
            },
            {
              key: 'netPrice'
            },
            {
              key: 'discountType'
            },
            {
              key: 'discountPercentage'
            },
            {
              key: 'discountAmount'
            },
            {
              key: 'globalDiscountType'
            },
            {
              key: 'globalDiscountPercentage'
            },
            {
              key: 'globalDiscountAmount'
            },
            {
              key: 'salesAttendant'
            },
            {
              key: 'cashier'
            },
            {
              key: 'doctor'
            },
            {
              key: 'timestamp'
            },
            {
              key: 'customerName'
            },
            {
              key: 'companyCode'
            },
            {
              key: 'storeCode'
            },
            {
              key: 'specsSalesType'
            },
            {
              key: 'specsFromWarehouse'
            },
            {
              key: 'poNumber'
            }
          ];

          worksheet.columns.forEach((sheetColumn) => {
            sheetColumn.font = {
              size: 11
            };
            sheetColumn.width = 40;
          });

          worksheet.getRow(1).font = {
            bold: true,
            size: 11
          };

          rows.forEach((item) => {
            worksheet.addRow(item);
          });

          const urlPath = path.join(
            documentsDir,
            'UMBRA_POS_REPORTS',
            'SL_CL',
            test[session.settings.activeCategory.toLowerCase()].folder
          );
          !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });

          const transactionDateData = transactionDate.split(' ');
          const dateData = transactionDateData[0].split('-');
          const nameDateFormat = `${dateData[1]}${dateData[2]}${dateData[0]}`;

          const exportPath = path.resolve(
            urlPath,
            `${test[session.settings.activeCategory.toLowerCase()].spCode}_${session.settings.storeCode
            }_SL_${nameDateFormat}_01.csv`
          );

          workbook.csv
            .writeFile(exportPath)
            .then(() => {
              connection.end();
              return res.status(200).json({ data: result });
            })
            .catch((err) => {
              console.log("err ", err)
              connection.end();
              return res.status(500).json({ message: 'SL File not created.' });
            });
        }
      }
    );
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    connection.end();

    return next(error);
  }
};

exports.downloadSl = async (req, res, next) => {
  const { transactionDate } = req.params;
  const { settings } = session;

  const test = {
    optical: {
      folder: 'OPTICAL',
      spCode: 'SP'
    },
    sun: {
      folder: 'STUDIOS',
      spCode: 'SS'
    },
    face: {
      folder: 'FACE',
      spCode: 'SF'
    }
  };

  try {
    // Get URL Path
    const urlPath = path.join(
      documentsDir,
      'UMBRA_POS_REPORTS',
      'SL_CL',
      test[session.settings.activeCategory.toLowerCase()].folder
    );

    // const zip = new AdmZip();

    const transactionDateData = transactionDate.split(' ');
    const dateData = transactionDateData[0].split('-');
    const nameDateFormat = `${dateData[1]}${dateData[2]}${dateData[0]}`;

    // Filenames for sl and cl csv
    const slCsvFile = `${test[session.settings.activeCategory.toLowerCase()].spCode}_${session.settings.storeCode
      }_SL_${nameDateFormat}_01.csv`;

    const clCsvFile = `${test[session.settings.activeCategory.toLowerCase()].spCode}_${session.settings.storeCode
      }_CL_${nameDateFormat}_01.csv`;

    // If files exist, then proceed to sending
    if (
      fs.existsSync(path.join(urlPath, slCsvFile)) &&
      fs.existsSync(path.join(urlPath, clCsvFile))
    ) {
      const urlPath = `${documentsDir}/UMBRA_POS_REPORTS/SL_CL/${test[session.settings.activeCategory.toLowerCase()].folder}`;

      if (!settings.slClHost && !settings.slClPassword && !settings.slClUser) {
        const error = new HttpError('Missing credentials on sending SL/CL to FTP. Please add FTP credentials on settings');
        return next(error);
      }

      const sendFile = (file) => {
        return new Promise((resolve, reject) => {
          const c = new Client();
          c.connect({
            host: settings.slClHost,
            port: settings.slClPort || 21,
            user: settings.slClUser,
            password: settings.slClPassword
          });

          c.on('error', (err) => {
            console.log(`Error is `, err.message);
            reject(err);
          });
          c.on('ready', function () {
            console.log(`Ready to connect`);
            c.put(
              `${urlPath}/${slCsvFile}`,
              `${settings.slClPath}/${test[session.settings.activeCategory.toLowerCase()].folder}/${file}`,
              function (err) {
                if (err) {
                  c.end();
                  reject(err);
                }

                c.end();
                resolve(true);
              }
            );
          });

        });
      };

      await Promise.all([
        sendFile(slCsvFile),
        sendFile(clCsvFile)
      ]);

      return res.status(200).json({ message: 'SL/CL files sent successfully' });
    } else {
      const error = new HttpError('No SL/CL files found', 500);
      return next(error);
    }

  } catch (err) {
    const error = new HttpError(err.message, 500);
    return next(error);
  }
};

exports.downloadCl = async (req, res, next) => {
  // const { transactionDate } = req.params;

  const urlPath = `${documentsDir}/UMBRA_POS_REPORTS/SL_CL/`;
  !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });

  // await res.download(`${urlPath}/SP CL.csv`, `SP CL - ${transactionDate}.csv`);
  res.status(200).json({ message: 'DOWNLOAD CL COMPLETE' });
};

exports.voidSlClReport = async (req, res, next) => {
  const { siNumber, action } = req.params;

  const deleteCl = (dbConn, siNumber) => {
    return new Promise((resolve, reject) => {
      dbConn.query(`DELETE FROM _pos_sunniess_cl WHERE invoice_no = '${siNumber}'`)
        .then(([result]) => {
          resolve(result);
        })
        .catch(err => {
          console.log(err);
          reject('Failed to delete CL report, please try again.');
        });
    });
  };

  const updateSl = (dbConn, siNumber, action) => {
    return new Promise((resolve, reject) => {
      dbConn.query(`UPDATE _pos_sunniess_sl SET status = '${action}' WHERE invoice_no = '${siNumber}'`)
        .then(([result]) => {
          resolve(result);
        })
        .catch(err => {
          console.log(err);
          reject(`Failed to ${action} SL report, please try again.`);
        });
    });
  };
  

  const connection = ssis().promise();

  try {
    internetAvailable({
      // Provide maximum execution time for the verification
      timeout: 5000,
      // If it tries 5 times and it fails, then it will throw no internet
      retries: 2
    })
      .then(async () => {
        const backupConnection = backupDb().promise();

        try {
          await Promise.all([
            deleteCl(backupConnection, siNumber),
            updateSl(backupConnection, siNumber, action)
          ]);

          backupConnection.end();
        } catch (err) {
          backupConnection.end();
        }
      })
      .catch(() => console.log('No internet'));

    try {
      const [result] = await Promise.all([
        deleteCl(connection, siNumber),
        updateSl(connection, siNumber, action)
      ]);

      connection.end();
      res.status(200).json({ data: result });
    } catch (err) {
      const error = new HttpError(err, 500);
      connection.end();
      return next(error);
    }
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    connection.end();

    return next(error);
  }
};

// const spEasyFtp = async () => {
//   var ftp = new EasyFtp();
//   var config = {
//     host: '13.251.107.240',
//     port: 21,
//     username: 'sunnies00',
//     password: 'B!jQ3deu',
//     type: 'ftp'
//   };

//   ftp.connect(config);
//   ftp.cd('///slcl_test', function (err, path) {
//     console.log(path);
//   });
// };

// const readSp = () => {
//   const c = new Client();

//   try {
//     c.connect({
//       host: '13.251.107.240',
//       port: 21,
//       path: '../',
//       user: 'sunnies00',
//       password: 'B!jQ3deu'
//     });

//     c.on('error', console.dir);
//     c.on('ready', function () {
//       c.list(function (err, list) {
//         if (err) throw err;
//         console.dir(list);
//         c.end();
//       });
//     });
//   } catch (err) {
//
//   }
// };

// const testFs = () => {
//   const fs = require('fs');
//   const testFolder = 's:13.251.107.240';

//   fs.readdir(testFolder, (err, files) => {
//     if (err) return console.log(err, 'line 566');
//     files.forEach((file) => {
//       console.log(file);
//     });
//   });
// };
