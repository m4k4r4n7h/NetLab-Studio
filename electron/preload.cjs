const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('netlabDesktop', {
  platform: process.platform
});
