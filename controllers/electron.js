const Settings = require('../models/Settings');
const HttpError = require('../middleware/http-error');
const session = require('express-session');
const axios = require('axios');
const { defaultSettings, SettingsCategoryEnum } = require('./common/settingsData');
const path = require('path');
const fs = require('fs');

exports.getAppVersion = async (req, res, next) => {
  try {
    const packageJsonPath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    const appVersion = packageJson.version || '1.0.0';
    let settings;

    settings = await Settings.find();

    if (settings.length < 1) {
      let startupSettings = new Settings(defaultSettings);
      await startupSettings.save();

      settings = defaultSettings;
    } else {
      settings = settings[0];
    }

    session.settings = settings;

    const { birVersion } = settings[SettingsCategoryEnum.BirInfo];

    return res.status(201).json({ version: appVersion, birVersion });
  } catch (err) {
    const error = new HttpError('Failed to fetch data, please try again.', 500);
    return next(error);
  }
};

exports.downloadRelease = async (req, res, next) => {
  const { assetId } = req.params;

  try {
    const { data: asset } = await axios.get(
      `https://api.github.com/repos/Umbra-Digital-Company/umbra-pos-retails/releases/assets/${assetId}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${process.env.GITHUB_API_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    const { data: file } = await axios.get(
      `https://api.github.com/repos/Umbra-Digital-Company/umbra-pos-retails/releases/assets/${assetId}`,
      {
        responseType: 'stream',
        headers: {
          Accept: 'application/octet-stream',
          Authorization: `Bearer ${process.env.GITHUB_API_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    // return a downloadable file
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename=${asset.name}`);

    file.pipe(res);

    file.on('error', (err) => {
      console.error(err);
      const error = new HttpError('Unable to download the release file.', 500);
      return next(error);
    });

    file.on('end', () => {
      res.end();
    });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Unable to download the release file.', 500);
    return next(error);
  }
};
