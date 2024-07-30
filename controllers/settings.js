const Settings = require('../models/Settings');
const UmbraSystemsConfig = require('../models/UmbraSystemsConfig');
const Preview = require('../models/Preview');
const RobinsonsLogs = require('../models/RobinsonLogs');
const RobinsonFileLogs = require('../models/RobinsonFileLogs');
const CashLog = require('../models/CashLog');
const LoginLog = require('../models/LoginLog');
const ReadLog = require('../models/ReadLog');
const ActivityLog = require('../models/ActivityLog');
const Counter = require('../models/Counter');
const Transaction = require('../models/Transaction');
const TransactionAmount = require('../models/TransactionAmount');
const PaymentLog = require('../models/PaymentLog');
const DiscountLog = require('../models/DiscountLog');
const SCPWDReport = require('../models/SCPWDReport');
const PromoCode = require('../models/PromoCode');
const Order = require('../models/Order');
const ResetCountLog = require('../models/ResetCountLog');
const Product = require("../models/Product");
const User = require("../models/User");
const Category = require('../models/Category');


const HttpError = require('../middleware/http-error');
let session = require('express-session');
const moment = require('moment');
const { default: mongoose } = require('mongoose');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { defaultSettings, SettingsCategoryEnum } = require('./common/settingsData');


exports.backupDatabase = async (req, res, next) => {
  try {
    const { password } = req.query;
    const currentDateTime = moment().format('DD-MM-YYYY-HHmm');

    const settings = await Settings.findOne({});
    const { storeCode } = settings[SettingsCategoryEnum.UnitConfig] ?? {};

    // Hard coded password for now. Can be changed on admin settings
    const TEMP_PASSWORD = 'umbradigitalcompany';
    if (!password || password !== TEMP_PASSWORD) {
      return res.status(401).json({ message: 'Invalid credentials. Please try again' });
    }


    // Create backup directory if not exist
    const filePath = path.join(path.join(os.homedir(), 'Documents'), 'UMBRA_POS_BACKUP');
    !fs.existsSync(filePath) && fs.mkdirSync(filePath, { recursive: true });

    // MongoDB
    // Get all model names in mongodb
    const modelNames = Object.keys(mongoose.models);

    let mongodbBackupData = {};

    // Fetch data for each model in MongoDB
    await Promise.all(modelNames.map(async (modelName) => {
      const Model = mongoose.model(modelName);
      const data = await Model.find({});
      mongodbBackupData[modelName] = data;
    }));
    const mongodbBackupFilePath = path.join(filePath, `mongodb${storeCode}${currentDateTime}.json`);

    fs.writeFileSync(mongodbBackupFilePath, JSON.stringify(mongodbBackupData, null, 2));

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Backup process failed:', err.message);
    const error = new HttpError(err, req, 'Backup mysql failed', 500);
    return next(error);
  }
};

exports.getSettings = async (req, res, next) => {
  let settings = false;

  try {
    settings = await Settings.find();
  } catch (err) {
    const error = new HttpError('Failed to fetch data, please try again.', 500);
    return next(error);
  }

  if (settings.length < 1) {
    settings = new Settings(defaultSettings);
    try {
      // await settings.save();
    } catch (err) {
      console.error(err);
      const error = new HttpError('Creating preview failed, please try again.', 500);
      return next(error);
    }

    settings = defaultSettings;
  } else {
    settings = settings[0];
  }

  session.settings = settings;

  res.status(200).json({ data: settings });
};

exports.updateSettings = async (req, res, next) => {
  const { id, unitConfiguration, birInformation, companyInformation, paymentMethod } = req.body;
  try {
    const updatedSettings = await Settings.updateOne(
      { _id: id },
      {
        $set: {
          unitConfiguration, birInformation, companyInformation, paymentMethod
        }
      }
    );
    if (!updatedSettings) throw 'Failed to update data, please try again.';
    res.status(200).json({ data: updatedSettings });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Failed to update data, please try again.', 500);
    return next(error);
  }

};

exports.getUmbraSystemsConfig = async (req, res, next) => {
  let umbraSystemsConfig = false;

  try {
    umbraSystemsConfig = await UmbraSystemsConfig.find();
  } catch (err) {
    const error = new HttpError(err, req, 'Failed to fetch data, please try again.', 500);
    return next(error);
  }

  if (umbraSystemsConfig.length < 1) {
    const defaultConfig = {
      endpoint: process.env.UMBRA_SYSTEMS_API_URL || 'http://localhost:4000/',
      apiKey: null,
      deviceId: null,
      deviceName: '',
      status: 'disconnected'
    }

    umbraSystemsConfig = new UmbraSystemsConfig(defaultConfig);

    try {
      await umbraSystemsConfig.save();
    } catch (err) {
      const error = new HttpError(err, req, 'Creating config failed, please try again.', 500);
      return next(error);
    }
  } else {
    umbraSystemsConfig = umbraSystemsConfig[0];
  }

  res.status(200).json(umbraSystemsConfig);
};

exports.updateUmbraSystemsConfig = async (req, res, next) => {
  const {
    id,
    endpoint,
    apiKey,
    deviceId,
    deviceName,
    status
  } = req.body;

  let updatedUmbraSystemsConfig = false;

  try {
    updatedUmbraSystemsConfig = await UmbraSystemsConfig.updateOne(
      { _id: id },
      {
        $set: {
          endpoint,
          apiKey,
          deviceId,
          deviceName,
          status
        }
      }
    );
  } catch (err) {
    const error = new HttpError(err, req, 'Failed to update data, please try again.', 500);
    return next(error);
  }

  if (!updatedUmbraSystemsConfig) {
    const error = new HttpError('Failed to update data, please try again.', 500);
    return next(error);
  }

  res.status(200).json({ data: updatedUmbraSystemsConfig });
};

exports.reindexCollections = async (req, res, next) => {
  try {

    // delete existing indexes
    await Preview.collection.dropIndexes();

    // recreate indexes
    await Preview.collection.createIndex({ 'data.cart.payments.siNumber': -1 }, { sparse: true });
    await Preview.collection.createIndex({ 'data.cart.confirmOrders.orderId': -1 }, { sparse: true });
    await Preview.collection.createIndex({ txnNumber: -1 });
    await Preview.collection.createIndex({ storeCode: -1, type: -1, transactionDate: -1 });
    await Preview.collection.createIndex({ storeCode: -1, type: -1, transactionDate: -1, 'data.xReadData.txnAmounts': -1 }, { sparse: true });
    await Preview.collection.createIndex({ storeCode: -1, transactionDate: -1 });
    await Preview.collection.createIndex({ storeCode: -1, transactionDate: -1, createdAt: -1 });
    await Preview.collection.createIndex({ type: -1 });
    await Preview.collection.createIndex({ transactionDate: -1 });

    // recreate ActivityLog indexes
    await ActivityLog.collection.createIndex({ action: -1, });
    await ActivityLog.collection.createIndex({ activityDate: -1, });
    await ActivityLog.collection.createIndex({ storeCode: -1, });
    await ActivityLog.collection.createIndex({ storeCode: -1, action: -1, });
    await ActivityLog.collection.createIndex({ storeCode: -1, activityDate: -1, });
    await ActivityLog.collection.createIndex({ activityDate: -1, action: -1, });
    await ActivityLog.collection.createIndex({ storeCode: -1, activityDate: -1, });
    await ActivityLog.collection.createIndex({ activityDate: -1, action: -1, });
    await ActivityLog.collection.createIndex({ storeCode: -1, action: -1, });
    await ActivityLog.collection.createIndex({ storeCode: -1, activityDate: -1, action: -1 });

    // recreate CashLog indexes
    await CashLog.collection.createIndex({ type: -1, employeeId: -1, branchCode: -1, cashDate: -1 });
    await CashLog.collection.createIndex({ 'project.cashier_id': -1, 'project.cashier_first_name': -1, 'project.cashier_last_name': -1 }, { sparse: true });
    await CashLog.collection.createIndex({ 'project.total': -1, 'project.cashier_first_name': -1, 'project.cashier_last_name': -1, 'project.shift': -1 }, { sparse: true });
    await CashLog.collection.createIndex({ type: -1, employeeId: -1, cashDate: -1 });
    await CashLog.collection.createIndex({ branchCode: -1, type: -1, cashDate: -1 });
    await CashLog.collection.createIndex({ type: -1, cashDate: -1, employeeId: -1, createdAt: -1 });
    await CashLog.collection.createIndex({ type: -1, cashDate: -1 });

    //  recreate Categories indexes
    await Category.collection.createIndex({ name: -1 });

    //  recreate DiscountLog indexes
    await DiscountLog.collection.createIndex({ employeeId: -1, storeCode: -1, discountDate: -1 });
    await DiscountLog.collection.createIndex({ discount: -1, storeCode: -1, discountDate: -1 });
    await DiscountLog.collection.createIndex({ employeeId: -1, createdAt: -1, txnNumber: -1, discountDate: -1 });
    await DiscountLog.collection.createIndex({ discountDate: -1, txnNumber: -1 });

    //  recreate LoginLogs indexes
    await LoginLog.collection.createIndex({ loginDate: -1, employeeId: -1, storeCode: -1 });
    await LoginLog.collection.createIndex({ loginDate: -1 });

    //  recreate LoginLogs indexes
    await Order.collection.createIndex({ orderId: -1 });
    await Order.collection.createIndex({ status: -1 });
    await Order.collection.createIndex({ txnNumber: -1 });
    await Order.collection.createIndex({ siNumber: -1 });
    await Order.collection.createIndex({ orderDate: -1 });
    await Order.collection.createIndex({ orderId: -1, 'products.status': -1 }, { sparse: true });
    await Order.collection.createIndex({ 'products.poNumber': -1, 'products.productCode': -1, 'products.status': -1, }, { sparse: true });
    await Order.collection.createIndex({ 'products.status': -1 }, { sparse: true });
    await Order.collection.createIndex({ status: -1, orderDate: -1 });
    await Order.collection.createIndex({ status: -1, paymentDate: -1 });
    await Order.collection.createIndex({ status: -1, orderDate: -1, 'products.status': -1 }, { sparse: true });
    await Order.collection.createIndex({ status: -1, orderDate: -1, employeeId: -1, createdAt: -1 });
    await Order.collection.createIndex({ status: -1, paymentDate: -1, employeeId: -1, createdAt: -1 });
    await Order.collection.createIndex({ storeCode: -1, status: -1 });
    await Order.collection.createIndex({ storeCode: -1, status: -1, createdAt: -1 });
    await Order.collection.createIndex({ storeCode: -1, status: -1, paymentDate: -1 });
    await Order.collection.createIndex({ storeCode: -1, status: -1, 'products.productCode': -1 }, { sparse: true });
    await Order.collection.createIndex({ storeCode: -1, status: -1, paymentDate: -1, 'products.productCode': -1 }, { sparse: true });
    await Order.collection.createIndex({ storeCode: -1, status: -1, siNumber: -1 });
    await Order.collection.createIndex({ storeCode: -1, status: -1, paymentDate: -1, siNumber: -1 });
    await Order.collection.createIndex({ paymentDate: -1, status: -1, employeeId: -1, createdAt: -1 });
    await Order.collection.createIndex({ orderDate: -1, employeeId: -1, createdAt: -1 });

    //  recreate PaymentLogs indexes
    await PaymentLog.collection.createIndex({ txnNumber: -1 });
    await PaymentLog.collection.createIndex({ storeCode: -1, paymentDate: -1 });
    await PaymentLog.collection.createIndex({ storeCode: -1, paymentDate: -1, txnNumber: -1 });
    await PaymentLog.collection.createIndex({ method: -1, paymentDate: -1 });
    await PaymentLog.collection.createIndex({ txnNumber: -1, paymentDate: -1 });
    await PaymentLog.collection.createIndex({ status: -1, paymentDate: -1 });
    await PaymentLog.collection.createIndex({ status: -1, excessCash: -1, paymentDate: -1 });
    await PaymentLog.collection.createIndex({ paymentDate: -1, txnNumber: -1, employeeId: -1, createdAt: -1 });
    await PaymentLog.collection.createIndex({ paymentDate: -1, txnNumber: -1, method: -1, employeeId: -1, createdAt: -1 });

    //  recreate Product indexes
    await Product.collection.createIndex({ category: -1 });
    await Product.collection.createIndex({ name: -1 });
    await Product.collection.createIndex({ productCode: -1 });
    await Product.collection.createIndex({ name: -1, category: -1, availability: -1 });
    await Product.collection.createIndex({ productCode: -1, category: -1, availability: -1 });
    await Product.collection.createIndex({ availability: -1, price: -1 });

    //  recreate Promocode indexes
    await PromoCode.collection.createIndex({ itemDiscount: -1, isArchive: -1 });
    await PromoCode.collection.createIndex({ orderDiscount: -1, isArchive: -1 });
    await PromoCode.collection.createIndex({ transactionDiscount: -1, isArchive: -1 });
    await PromoCode.collection.createIndex({ itemDiscount: -1, isArchive: -1 });
    await PromoCode.collection.createIndex({ promoName: -1 });
    await PromoCode.collection.createIndex({ promoId: -1 });

    //  recreate ReadLog indexes
    await ReadLog.collection.createIndex({ type: -1 });
    await ReadLog.collection.createIndex({ readDate: -1 });
    await ReadLog.collection.createIndex({ storeCode: -1, type: -1 });
    await ReadLog.collection.createIndex({ txnDate: -1, employeeId: -1 });

    //  recreate Reset Count Log indexes
    await ResetCountLog.collection.createIndex({ lastStoreCode: -1 });

    //  recreate RobinsonFilesLogs indexes
    await RobinsonFileLogs.collection.createIndex({ fileName: -1 });
    await RobinsonFileLogs.collection.createIndex({ sent: -1 });
    await RobinsonFileLogs.collection.createIndex({ sent: -1, transactionDate: -1 });

    //  recreate RobinsonLogs indexes
    await RobinsonsLogs.collection.createIndex({ transactionDate: -1 });
    await RobinsonsLogs.collection.createIndex({ storeCode: -1, transactionDate: -1 });
    await RobinsonsLogs.collection.createIndex({ fileName: -1, storeCode: -1, transactionDate: -1 });

    //  recreate SCPWD indexes
    await SCPWDReport.collection.createIndex({ txnNumber: -1, storeCode: -1 });
    await SCPWDReport.collection.createIndex({ reportDate: -1, storeCode: -1 });
    await SCPWDReport.collection.createIndex({ txnNumber: -1, reportDate: -1, storeCode: -1 });

    //  recreate Transaction Amounts indexes
    await TransactionAmount.collection.createIndex({ transactionDate: -1, txnNumber: -1, employeeId: -1 });
    await TransactionAmount.collection.createIndex({ transactionDate: -1, txnNumber: -1, employeeId: -1, createdAt: -1, vatExempt: -1, vatZeroRated: -1 });
    await TransactionAmount.collection.createIndex({ transactionDate: -1, txnNumber: -1 });
    await TransactionAmount.collection.createIndex({ transactionDate: -1, txnNumber: -1, vatExempt: -1, vatZeroRated: -1 });

    //  recreate Transaction indexes
    await Transaction.collection.createIndex({ type: -1 });
    await Transaction.collection.createIndex({ transactionDate: -1 });
    await Transaction.collection.createIndex({ storeCode: -1, type: -1 });
    await Transaction.collection.createIndex({ transactionDate: -1, type: -1 });
    await Transaction.collection.createIndex({ transactionDate: -1, siNumber: -1 });
    await Transaction.collection.createIndex({ siNumber: -1, storeCode: -1, type: -1 });
    await Transaction.collection.createIndex({ storeCode: -1, transactionDate: -1, employeeId: -1, siNumber: -1 });
    await Transaction.collection.createIndex({ transactionDate: -1, employeeId: -1, createdAt: -1 });
    await Transaction.collection.createIndex({ transactionDate: -1, employeeId: -1, createdAt: -1, type: -1 });
    await Transaction.collection.createIndex({ transactionDate: -1, employeeId: -1, siNumber: -1 });

    //  recreate User indexes
    await User.collection.createIndex({ username: -1 });
    await User.collection.createIndex({ employeeId: -1 });
    await User.collection.createIndex({ role: -1 });
    await User.collection.createIndex({ employeeId: -1, role: -1, isArchive: -1 });
    await User.collection.createIndex({ firstname: -1, role: -1, isArchive: -1 });
    await User.collection.createIndex({ lastname: -1, role: -1, isArchive: -1 });
    await User.collection.createIndex({ username: -1, password: -1, role: -1, isArchive: -1 });


    res.status(200).json({ message: 'Success!' });
  } catch (err) {
    const error = new HttpError(`Something went wrong, please try again.\n${err.message}`, 500);
    return next(error);
  }
};

exports.resetData = async (req, res, next) => {
  try {
    const { password, role } = req.query;

    // Hard coded password for now. Can be changed on admin settings

    // NO REFERENCE FOUND
    // TO BE REMOVE???
    const TEMP_PASSWORD = 'umbradigitalcompany';
    if (!password || password !== TEMP_PASSWORD) {
      return res.status(401).json({ message: 'Invalid credentials. Please try again' });
    }

    await this.resetCollections(role)


    res.status(200).json({ success: true });
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.getPosDate = async (req, res, next) => {
  try {
    const settings = await Settings.findOne({});

    if (settings) {
      const { startingDate } = settings[SettingsCategoryEnum.UnitConfig];
      const startDate = moment(startingDate).format('MMM DD YYYY');
      const latestZRead = await ReadLog.find({ type: 'z-read' }).sort({ readDate: -1 });
      res.status(200).json({
        posDate: latestZRead?.[0]?.readDate ? moment(latestZRead[0].readDate).utc().add(1, 'day').startOf('day').format('MMM DD YYYY') : startDate,
        systemDate: moment().format('MMM DD YYYY')
      });
    }
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong');
    next(error);
  }
};

exports.initCollections = async (req, res, next) => {
  try {

    const superadmin = await User.findOne({ username: 'umbra_admin', role: 'it_admin' })

    const activityCounter = await Counter.findOne({ _id: 'activityNumber' })

    const orderCounter = await Counter.findOne({ _id: 'orderNumber' })

    if (!superadmin) {
      await User.create({
        employeeId: "000001",
        firstname: "Umbra",
        middlename: "Pos",
        lastname: "Admin",
        role: "it_admin",
        contactNumber: "09123456789",
        username: "umbra_admin",
        password: "umbrapos",
        isArchive: false
      })
    }

    if (!activityCounter) {
      await Counter.create({
        _id: 'activityNumber',
        seq: 0
      })
    }

    if (!orderCounter) {
      await Counter.create({
        _id: 'orderNumber',
        seq: 0
      })
    }

    await this.seedCategories()
    await this.seedProducts()

    return res.status(200).json({
      message: 'Successfully initialized'
    })

  } catch (err) {
    console.log("err ", err)
    const error = new HttpError('Something went wrong');
    next(error);
  }
}

exports.seedCategories = async () => {
  const categoryNames = ["men's clothing", "women's clothing", "footwear", "accessories"];

  const existingCategories = await Category.find({ name: { $in: categoryNames } });

  if (existingCategories.length == 0) {
    await Category.insertMany([
      {
        name: "men's clothing"
      },
      {
        name: "women's clothing"
      },
      {
        name: "footwear"
      },
      {
        name: "accessories"
      },
    ])
  }
}

exports.seedProducts = async () => {
  const categoryNames = ["men's clothing", "women's clothing", "footwear", "accessories"];

  const categories = await Category.find({ name: { $in: categoryNames } });

  const products = [
    {
      name: 'Men T-Shirt',
      productCode: 'MTS001',
      description: 'A comfortable men\'s t-shirt',
      price: 359.99,
      category: categories.find(cat => cat.name === "men's clothing")._id,
      stock: 100,
      size: 'L',
      color: 'Blue',
      availability: true,
      vatable: true,
    },
    {
      name: 'Women Dress',
      productCode: 'WDS001',
      description: 'A stylish women\'s dress',
      price: 799.99,
      category: categories.find(cat => cat.name === "women's clothing")._id,
      stock: 50,
      size: 'M',
      color: 'Red',
      availability: true,
      vatable: true,
    },
    {
      name: 'Running Shoes',
      productCode: 'FTW001',
      description: 'Comfortable running shoes',
      price: 1599.99,
      category: categories.find(cat => cat.name === "footwear")._id,
      stock: 75,
      size: '42',
      color: 'Black',
      availability: true,
      vatable: true,
    },
    {
      name: 'Leather Belt',
      productCode: 'ACC001',
      description: 'Genuine leather belt',
      price: 1000,
      category: categories.find(cat => cat.name === "accessories")._id,
      stock: 200,
      size: 'One Size',
      color: 'Brown',
      availability: true,
      vatable: true,
    }
  ];

  const existingProducts = await Product.find({ productCode: { $in: products.map(p => p.productCode) } });
  const existingProductCodes = existingProducts.map(p => p.productCode);

  const productsToInsert = products.filter(p => !existingProductCodes.includes(p.productCode));

  if (productsToInsert.length > 0) {
    await Product.insertMany(productsToInsert);
  }
}

exports.resetCollections = async (role) => {
  await Promise.all([
    Preview.deleteMany({}),
    RobinsonsLogs.deleteMany({}),
    RobinsonFileLogs.deleteMany({}),
    CashLog.deleteMany({}),
    LoginLog.deleteMany({}),
    ReadLog.deleteMany({}),
    ActivityLog.deleteMany({}),
    Counter.findOneAndUpdate({ _id: 'activityNumber' }, { seq: 0 }),
    Counter.findOneAndUpdate({ _id: 'orderNumber' }, { seq: 0 }),
    Transaction.deleteMany({}),
    TransactionAmount.deleteMany({}),
    PaymentLog.deleteMany({}),
    DiscountLog.deleteMany({}),
    SCPWDReport.deleteMany({}),
    PromoCode.deleteMany({}),
    Order.deleteMany({}),
    ResetCountLog.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
  ]);

  if(role === 'admin'){
    await User.deleteMany({ username: { $ne: 'umbra_admin' } })
  }
}