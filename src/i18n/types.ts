export type Locale = 'en' | 'ru';

export interface Translations {
  // Toolbar
  'toolbar.connecting': string;
  'toolbar.disconnect': string;
  'toolbar.connect': string;
  'toolbar.reboot': string;
  'toolbar.password': string;
  'toolbar.loadTemplate': string;
  'toolbar.saveTemplate': string;
  'toolbar.noPorts': string;

  // Toolbar errors
  'error.disconnect': string;
  'error.selectPort': string;
  'error.connect': string;
  'error.reboot': string;
  'error.wrongPassword': string;
  'error.wrongPasswordDetail': string;
  'confirm.reboot': string;
  'confirm.rebootMessage': string;
  'confirm.yes': string;
  'confirm.cancel': string;

  // StatusBar
  'status.connected': string;
  'status.disconnected': string;

  // Sidebar tabs
  'tab.status': string;
  'tab.diagnostics': string;
  'tab.server': string;
  'tab.protocol': string;
  'tab.wifi': string;
  'tab.gps': string;
  'tab.inputsOutputs': string;
  'tab.rsInterfaces': string;
  'tab.fls': string;
  'tab.pumps': string;
  'tab.keyboard': string;
  'tab.security': string;
  'tab.printer': string;
  'tab.tags': string;

  // Common
  'common.sectionInDevelopment': string;
  'common.read': string;
  'common.save': string;

  // Status tab
  'status.identification': string;
  'status.series': string;
  'status.firmware': string;
  'status.device': string;
  'status.statusPanel': string;
  'status.time': string;
  'status.power': string;
  'status.latLon': string;
  'status.satellites': string;
  'status.gsmStatus': string;
  'status.wifiStatus': string;
  'status.intTemp': string;
  'status.pumps': string;
  'status.inputsOutputs': string;
  'status.inputs': string;
  'status.outputs': string;
  'status.levelSensors': string;
  'status.sensor': string;
  'status.height': string;
  'status.volume': string;
  'status.temperature': string;
  'status.density': string;
  'status.mm': string;
  'status.liters': string;
  'status.kgm3': string;
  'status.mass': string;
  'status.kg': string;
  'status.noSensorData': string;
  'status.cards': string;
  'status.lastTag': string;
  'status.tagsMemory': string;
  'status.tagsLimit': string;
  'status.tagsAdded': string;
  'status.add': string;

  // Server tab
  'server.apnSettings': string;
  'server.apnName': string;
  'server.apnLogin': string;
  'server.apnPassword': string;
  'server.serverSettings': string;
  'server.server': string;
  'server.ip': string;
  'server.port': string;
  'server.channel': string;
  'server.protocol': string;
  'server.channelGsm': string;
  'server.channelWifi': string;
  'server.channelGsmWifi': string;
  'server.channelWifiGsm': string;
  'server.protoIps': string;
  'server.protoGt9': string;
  'server.protoTsense': string;
  'server.reading': string;
  'server.saving': string;
  'server.readSuccess': string;
  'server.saveSuccess': string;
  'server.readError': string;
  'server.saveError': string;
  'server.notConnected': string;
  'server.imeiNotReady': string;
  'server.server2NotSupported': string;

  // Diagnostics tab
  'diag.addTime': string;
  'diag.wordWrap': string;
  'diag.copyAll': string;
  'diag.saveLog': string;
  'diag.clear': string;
  'diag.send': string;
  'diag.commandPlaceholder': string;
  'diag.channels': string;
  'diag.channelGsm': string;
  'diag.channelGnss': string;
  'diag.channel1Wire': string;
  'diag.channelWifi': string;
  'diag.channelPump': string;
  'diag.channelSflash': string;
  'diag.channelSd': string;
  'diag.channelRs232': string;
  'diag.channelRs232a': string;
  'diag.channelRs232b': string;
  'diag.channelRs485': string;
  'diag.channelRs485a': string;
  'diag.channelRs485b': string;
  'diag.copied': string;
  'diag.saved': string;
  'diag.notConnected': string;
}
