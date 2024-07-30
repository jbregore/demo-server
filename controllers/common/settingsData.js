// ----------------------------------------------------------------------
const SettingsCategoryEnum = {
  UnitConfig: 'unitConfiguration',
  BirInfo: 'birInformation',
  CompanyInfo: 'companyInformation',
  PaymentMethod: 'paymentMethod'
};
const MallAccrEnum = {
  None: 'none',
  Ayala: 'ayala',
  MegaWorld: 'megaworld',
  Robinson: 'robinson',
  SM: 'sm',
  ICM: 'icm',
  Araneta: 'araneta',
  EVIA: 'evia'
};

const smSalesTypeEnum = {
  smOne: 'SM01',
  smTwo: 'SM02',
  smThree: 'SM03'
};

const paymentMethodsStatic = [
  { id: 'cash', active: true, label: 'Cash', title: 'Cash Payment' },
  { id: 'creditCard', active: true, label: 'Credit Card', title: 'Credit/Debit Card' },
  // { id: 'eWallet', active: true, label: 'E-Wallet', title: 'E-Wallet' },
  { id: 'loyalty', active: true, label: 'Loyalty', title: 'Loyalty Points' },
  { id: 'giftCard', active: true, label: 'Gift Card', title: 'Gift Card' },
  { id: 'lazada', active: true, label: 'Lazada', title: 'Lazada' },
  { id: 'zalora', active: false, label: 'Zalora', title: 'Zalora' },
  { id: 'shoppee', active: true, label: 'Shoppee', title: 'Shoppee' },
  { id: 'rmes', active: true, label: 'Redemption', title: 'Redemption' },
  { id: 'lalamove', active: false, label: 'Lalamove', title: 'Lalamove' },
  { id: 'lbc', active: false, label: 'LBC', title: 'LBC' },
  { id: 'wsi', active: false, label: 'WSI', title: 'WSI' },
  { id: 'payo', active: false, label: 'Payo', title: 'Payo' },
  { id: 'consegnia', active: false, label: 'Consegnia', title: 'Consegnia' },
  { id: 'gcash', active: false, label: 'GCash', title: 'GCash' },
  { id: 'gcashQr', active: false, label: 'GCash QR', title: 'GCash QR' },
  { id: 'maya', active: false, label: 'Maya', title: 'Maya' },
  { id: 'mayaQr', active: false, label: 'Maya QR', title: 'Maya QR' },
  { id: 'paymongo', active: false, label: 'PayMongo', title: 'PayMongo' },
  { id: 'paypal', active: false, label: 'PayPal', title: 'PayPal' },
  { id: 'atome', active: false, label: 'Atome', title: 'Atome' },
  { id: 'bdoCredit', active: false, label: 'Card (BDO Credit)', title: 'Card (BDO Credit)' },
  { id: 'bdoDebit', active: false, label: 'Card (BDO Debit)', title: 'Card (BDO Debit)' },
  { id: 'mayaCredit', active: false, label: 'Card (Maya Credit)', title: 'Card (Maya Credit)' },
  { id: 'mayaDebit', active: false, label: 'Card (Maya Debit)', title: 'Card (Maya Debit)' },
];

const defaultSettings = {
  [SettingsCategoryEnum.UnitConfig]: {
    isConfigured: false,
    startingDate: '2022-11-28',
    storeCode: '1000',
    warehouseCode: '1000',
    printerName: 'printer1',
    doublePrinting: false,
    nonVat: false,
    snMin: 'SN For Registration / MIN For Registration',
    headerVatReg: 'For Approval',
    headerAccr: 'For Approval',
    devMode: true,
    ecomm: false,
    mallAccr: 'none',
    terminalNumber: '1',
    tenantId: '',
    permit: 'For Registration',
    ptuDateIssued: 'mm/dd/yyyy',
    companyCoded: '',
    contractNumber: '',
    contractName: '',
    printerWidth: {
      id: 'XP76',
      label: 'XP-76',
      width: 33
    }
  },
  [SettingsCategoryEnum.BirInfo]: {
    vatReg: '746191999',
    accr: '0407461919992022091606',
    birVersion: '1.0',
    accrDateIssued: '11/28/2022',
    taxCodeExempt: 'VOX',
    taxCodeRegular: 'O1',
    taxCodeZeroRated: 'O0'
  },
  [SettingsCategoryEnum.CompanyInfo]: {
    storeName: 'STORE NAME',
    companyName: 'COMPANY NAME',
    companyAddress1: 'COMPANY ADDRESS1',
    companyAddress2: 'COMPANY ADDRESS2',
    companyWebsiteLink: 'www.company-website.com',
    companyContactNumber: '09123456666'
  },
  [SettingsCategoryEnum.PaymentMethod]: paymentMethodsStatic
};

module.exports = {
  defaultSettings,
  SettingsCategoryEnum,
  MallAccrEnum,
  smSalesTypeEnum
};
// ----------------------------------------------------------------------
