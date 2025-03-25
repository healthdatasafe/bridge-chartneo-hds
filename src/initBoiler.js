/**
 * To be called first for any app launch
 */

module.exports = initBoiler;

function initBoiler (appName) {
  const path = require('path');
  const boiler = require('boiler').init({
    appName, // This will will be prefixed to any log messages
    baseFilesDir: path.resolve(__dirname, '..'), // use for file:// relative path if not give cwd() will be used
    baseConfigDir: path.resolve(__dirname, '../config'),
    extraConfigs: [{
      pluginAsync: {
        load: async function (store) {
          const storageDir = store.get('storage:files:directory') || './storage';
          const storageDirAbsolute = path.resolve(__dirname, '..', storageDir);
          store.set('storage:files:directoryAbsolute', storageDirAbsolute);
          return 'plugin-fileDirectoryAbsolute'; // my name
        }
      }
    }]
  });
  return boiler;
}
