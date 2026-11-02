'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME ||
  (process.platform === 'win32' ? path.join(os.homedir(), 'AppData/Local/Android/Sdk') :
    process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Android/sdk') : path.join(os.homedir(), 'Android/Sdk'));
const executable = process.platform === 'win32' ? 'adb.exe' : 'adb';
const installed = path.join(sdk, 'platform-tools', executable);
module.exports.adb = process.env.ADB || (fs.existsSync(installed) ? installed : executable);
