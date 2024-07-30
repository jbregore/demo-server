const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const morgan = require('morgan');
const HttpError = require('./middleware/http-error');
const fileupload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const session = require('express-session');

require('dotenv').config({
  path: `${__dirname}/.env`
});

const app = express();
const PORT = process.env.SERVER_PORT || 3333;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3001';
const UMBRASYSTEMS_API = process.env.UMBRASYSTEMS_API || 'http://localhost:4000';

const oneDay = 1000 * 60 * 60 * 24;
app.use(cookieParser());
app.use(
  session({
    secret: '342g532jh4kg54h2345j',
    saveUninitialized: true,
    resave: false,
    cookie: { maxAge: oneDay }
  })
);

app.use(fileupload());

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
app.use(morgan('tiny'));

const allowedOrigins = [FRONTEND_ORIGIN, UMBRASYSTEMS_API];

app.use(cors());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  }

  // Preflight request handling
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

const loginRoutes = require('./routes/login');
const orderRoutes = require('./routes/order');
const transactionRoutes = require('./routes/transaction');
const salesRoutes = require('./routes/sales');
const inventoryRoutes = require('./routes/inventory');
const employeeRoutes = require('./routes/employee');
const promoCodeRoutes = require('./routes/promoCode');
const activityRoutes = require('./routes/activity');
const reportsRoutes = require('./routes/reports');
const printerRoutes = require('./routes/thermalPrinter');
const loyaltyRoutes = require('./routes/loyalty');
const electronRoutes = require('./routes/electron');
const companySettingsRoutes = require('./routes/company-settings');
const settingsRoutes = require('./routes/settings');
const scriptRoutes = require('./routes/script');
const deviceRoutes = require('./routes/device');
const databaseBackupRoutes = require('./routes/database-backup');
const accreditationRoutes = require('./routes/accreditation');
const demoOrganizationRoutes = require('./routes/demo-organization');

app.use('/api/login', loginRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/promo-code', promoCodeRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/print-receipt', printerRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/electron', electronRoutes);
app.use('/api/company-settings', companySettingsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/script', scriptRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/database-backup', databaseBackupRoutes);
app.use('/api/accreditation', accreditationRoutes);
app.use('/api/demo-organization', demoOrganizationRoutes);

// eslint-disable-next-line no-unused-vars
app.use((req, res, next) => {
  const error = new HttpError('Could not find this route.', 404);
  throw error;
});


app.use((error, req, res, next) => {
  if (res.headerSent) {
    return next(error);
  }
  res.status(error.code || 500).json({ message: error.message || 'An unknown error occurred!' });
});

mongoose.set('strictQuery', false);

mongoose
  .connect(process.env.MONGODB_URI_LOCAL)
  .then(() => {
    app.listen(PORT, () => console.log(`Listening on PORT ${PORT}`));
  })
  .catch((err) =>
    console.log(`Failed to connect to Umbra-POS database! \n Connection error: ${err}`)
  );
