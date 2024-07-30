const { SettingsCategoryEnum } = require('../common/settingsData');

const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;

exports.openCashDrawer = async (req, res, next) => {
  const { settings } = req.body;
  let printer = new ThermalPrinter({
    type: Types.EPSON,
    interface: `//localhost/${settings[SettingsCategoryEnum.UnitConfig].printerName}`,
    width: `${settings[SettingsCategoryEnum.UnitConfig].printerWidth.width}px`,
    characterSet: 'SLOVENIA',
    removeSpecialCharacters: true,
    lineCharacter: '-'
  });

  // printer.append(Buffer.from([0x1b, 0x70, 0x00]));
  // printer.append(Buffer.from([0x1b, 0x70, 0x01]));
  // printer.append(Buffer.from([0x1b, 0x07, 0x0b, 0x37, 0x07]));
  printer.openCashDrawer();

  try {
    await printer.execute();
    console.log('Print success.');
    res.status(200).json({ data: 'success' });
  } catch (error) {
    console.error('Print error:', error);
    res.status(500).json({ data: 'success' });
  }
};
