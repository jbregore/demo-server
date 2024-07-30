const ssis = require('../config/db/ssis');
const HttpError = require('../middleware/http-error');
const Order = require('../models/Order');
const moment = require('moment/moment');
const { paginateOrderSales } = require('../services/simplePaginate');
const umbraSystemsHelper = require('../graphql/umbra-systems-helper');
const UmbraSystemsReport = require('../models/UmbraSystemsReport');

exports.getOverallTotalSales = async (req, res, next) => {
  const { branchCode } = req.params;

  try {
    const result = await Order.aggregate([
      {
        $match: {
          storeCode: branchCode,
          status: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' }
        }
      }
    ]);

    if (result.length > 0) {
      const responseData = { data: [{ total: result[0].total }] };
      res.status(200).json(responseData);
    } else {
      const responseData = { data: [{ total: 0 }] };
      res.status(200).json(responseData);
    }
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getOverallTotalOrders = async (req, res, next) => {
  const { branchCode } = req.params;

  try {
    const result = await Order.aggregate([
      {
        $match: {
          storeCode: branchCode,
          status: 'paid'
        }
      },
      {
        $count: 'total'
      }
    ]);

    if (result.length > 0) {
      const responseData = { data: result };
      res.status(200).json(responseData);
    } else {
      const responseData = { data: [{ total: 0 }] };
      res.status(200).json(responseData);
    }
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getTodayTotalSales = async (req, res, next) => {
  const { branchCode, transactionDate } = req.params;

  const [fromTxnDate, fromTxnTime] = moment(transactionDate)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(transactionDate)
    .endOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');

  try {
    const result = await Order.aggregate([
      {
        $match: {
          storeCode: branchCode,
          status: 'paid',
          createdAt: {
            $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
            $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' }
        }
      }
    ]);

    if (result.length > 0) {
      const responseData = { data: [{ total: result[0].total }] };
      res.status(200).json(responseData);
    } else {
      const responseData = { data: [{ total: 0 }] };
      res.status(200).json(responseData);
    }
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getTodayTotalOrders = async (req, res, next) => {
  const { branchCode, transactionDate } = req.params;

  const [fromTxnDate, fromTxnTime] = moment(transactionDate)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(transactionDate)
    .endOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');

  try {
    const result = await Order.aggregate([
      {
        $match: {
          storeCode: branchCode,
          status: 'paid',
          createdAt: {
            $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
            $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 }
        }
      }
    ]);

    if (result.length > 0) {
      const responseData = { data: [{ total: result[0].total }] };
      res.status(200).json(responseData);
    } else {
      const responseData = { data: [{ total: 0 }] };
      res.status(200).json(responseData);
    }
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getProductsSales = async (req, res, next) => {
  const { storeCode } = req.params;
  const { from, to } = req.query;
  const {
    page = 1,
    pageSize = 5,
    search = '',
    sortBy = 'totalAmount',
    sortOrder = 'desc'
  } = req.query;

  const [fromTxnDate, fromTxnTime] = moment(from)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(to).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

  let query = { storeCode, status: 'paid' };

  if (search) {
    query = {
      'products.productCode': { $regex: new RegExp(search, 'i') }
    };
  }

  if (from && to) {
    query.paymentDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  const { paginationMeta, limit, skip } = await paginateOrderSales(
    Order,
    { page, pageSize },
    query
  );

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  try {
    const result = await Order.aggregate([
      { $match: query },
      { $unwind: '$products' },
      { $match: { 'products.status': { $ne: 'cancelled' } } },
      {
        $group: {
          _id: {
            productCode: '$products.productCode',
            productName: '$products.productName'
          },
          countOrders: { $sum: '$products.quantity' },
          totalAmount: { $sum: '$products.price' }
        }
      },
      {
        $project: {
          _id: 0,
          productCode: '$_id.productCode',
          productName: '$_id.productName',
          countOrders: 1,
          totalAmount: 1
        }
      },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limit }
    ]);

    return res.status(200).json({
      meta: paginationMeta,
      data: result
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getTotalSalesByProduct = (req, res, next) => {
  const { productCode, branchCode } = req.params;

  const connection = ssis();
  try {
    connection.query(
      `
        SELECT
          product_code as productCode,
          count(product_code) as totalOrders,
          sum(price) as totalSales
        FROM
          orders_specs
        WHERE
          (
            product_code = "${productCode}"
            OR
            product_upgrade = "${productCode}"
            OR
            lens_code = "${productCode}"
          )
        AND
          status = "paid"
        AND
          order_id LIKE "%${branchCode}-%"
        GROUP BY
          product_code
      `,
      function (err, result) {
        if (err) {
          const error = new HttpError('Failed to get product total sales, please try again.', 500);
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

exports.getPaymentReports = async (req, res) => {
  const { branchCode } = req.params;
  const { from, to } = req.query;
  const {
    page = 1,
    pageSize = 5,
    search = '',
    sortBy = 'paymentDate',
    sortOrder = 'desc'
  } = req.query;

  const [fromTxnDate, fromTxnTime] = moment(from)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(to).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

  let query = { storeCode: branchCode, status: 'paid' };

  if (from) {
    query.paymentDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`)
    };
  }

  if (to) {
    query.paymentDate = {
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (from && to) {
    query.paymentDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (search) {
    query.siNumber = { $regex: new RegExp(search, 'i') };
  }

  try {
    const unwindCountPipeline = [
      { $match: query },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'payment logs',
          localField: 'paymentMethods',
          foreignField: '_id',
          as: 'paymentLogs'
        }
      },
      {
        $match: {
          paymentLogs: { $not: { $size: 0 } },
          'products.status': { $ne: 'cancelled' }
        }
      },
      { $group: { _id: null, totalCount: { $sum: 1 } } }
    ];
    const unwindResult = await Order.aggregate(unwindCountPipeline);

    const totalCount = unwindResult.length > 0 ? unwindResult[0].totalCount : 0;

    const pageNumber = parseInt(page);
    const limit = parseInt(pageSize);
    const skip = (pageNumber - 1) * limit;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const orders = await Order.aggregate([
      { $match: query },
      { $unwind: '$products' },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'payment logs',
          localField: 'paymentMethods',
          foreignField: '_id',
          as: 'paymentLogs'
        }
      },
      {
        $addFields: {
          'products.total': '$products.price'
        }
      },
      {
        $match: {
          paymentLogs: { $ne: [] },
          'products.status': { $ne: 'cancelled' }
        }
      },
      {
        $project: {
          _id: 0,
          total: { $toString: '$products.total' },
          poNumber: '$products.poNumber',
          siNumber: '$siNumber',
          dateCreated: '$paymentDate',
          currency: { $arrayElemAt: ['$paymentLogs.currency', 0] },
          paymentStatus: { $arrayElemAt: ['$paymentLogs.status', 0] },
          paymentMethod: '$paymentLogs.method'
        }
      }
    ]);

    const nextPage = skip + limit < totalCount ? pageNumber + 1 : null;
    const lastPage = Math.ceil(totalCount / limit);

    const paginationMeta = {
      totalRecords: totalCount,
      nextPage: nextPage,
      lastPage: lastPage
    };

    return res.status(200).json({
      meta: paginationMeta,
      data: orders
    });
  } catch (err) {
    console.log('err ', err);
    return res.status(400).json({ message: err.message });
  }
};

exports.sendSalesReport = async (req, res, next) => {
  const { posDeviceId, apiKey, posDate, enqueue } = req.body;

  try {
    let response = {
      message: 'OK',
      code: 200
    };

    try {
      const dateFilter = {
        $gte: new Date(`${posDate} 00:00:00`),
        $lte: new Date(`${posDate} 23:59:59`)
      };

      const productSales = await Order.aggregate([
        {
          $match: {
            status: 'paid',
            paymentDate: dateFilter
          }
        },
        {
          $unwind: {
            path: '$products'
          }
        },
        {
          $match: {
            'products.status': 'paid'
          }
        },
        {
          $addFields: {
            posDate,
            posDeviceId,
            paymentHour: { $hour: '$paymentDate' }
          }
        },
        {
          $group: {
            _id: {
              productCode: '$products.productCode',
              paymentHour: '$paymentHour'
            },
            category: {
              $first: '$products.categoryName'
            },
            productCode: {
              $first: '$products.productCode'
            },
            productName: {
              $first: '$products.productName'
            },
            countOrders: {
              $sum: '$products.quantity'
            },
            totalAmount: {
              $sum: '$products.price'
            },
            posDate: {
              $first: '$posDate'
            },
            posDeviceId: {
              $first: '$posDeviceId'
            },
            hour: { $first: '$paymentHour' }
          }
        },
        {
          $project: {
            _id: 0,
            category: 1,
            productCode: 1,
            productName: 1,
            countOrders: 1,
            totalAmount: 1,
            posDate: 1,
            posDeviceId: 1,
            hour: 1
          }
        }
      ]);

      if (enqueue) {
        await Promise.all([
          UmbraSystemsReport.create({
            type: 'product_sales',
            posDeviceId,
            data: productSales
          }),
        ]);
      } else {
        await Promise.all([
          umbraSystemsHelper.sendPosProductSales(productSales, {
            apiKey,
            deviceId: posDeviceId
          }),
        ]);
      }
    } catch (error) {
      response.message = 'Failed to send sales report.';
      response.code = 500;
    }

    res.status(response.code).json({
      message: response.message
    });
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);

    return next(error);
  }
};

exports.enqueueGrandAccumulatedReport = async (req, res, next) => {
  const { posDeviceId, posGrandAccumulatedSales } = req.body;

  try {
    await UmbraSystemsReport.create({
      type: 'grand_accumulated_sales',
      posDeviceId,
      data: posGrandAccumulatedSales
    });

    res.status(200).json({
      message: 'OK'
    });
  } catch (err) {
    const error = new HttpError('Failed to enqueue grand accumulated sales report.', 500);

    return next(error);
  }
};

exports.uploadReportsQueue = async (req, res, next) => {
  const { apiKey } = req.body;

  try {
    const reports = await UmbraSystemsReport.find({});

    // for (const report of reports) {
    //   const { type, posDeviceId, data, createdAt } = report;

    //   if (type === 'product_sales') {
    //     await umbraSystemsHelper.sendPosProductSales(data, {
    //       apiKey,
    //       deviceId: posDeviceId
    //     });
    //   } else if (type === 'grand_accumulated_sales') {
    //     await umbraSystemsHelper.sendPosGrandAccumulatedSales(data, {
    //       apiKey,
    //       deviceId: posDeviceId
    //     });
    //   } else if (type === 'pos_transaction') {
    //     await umbraSystemsHelper.sendPosTransaction(data, {
    //       apiKey,
    //       deviceId: posDeviceId
    //     });
    //   }

    //   console.log('Uploaded from queue:', type, createdAt);
    //   await UmbraSystemsReport.findOneAndDelete({ _id: report._id });
    // }

    res.status(200).json({
      message: 'OK'
    });
  } catch (err) {
    const error = new HttpError('An error occured while uploading reports from queue.', 500);

    return next(error);
  }
};
