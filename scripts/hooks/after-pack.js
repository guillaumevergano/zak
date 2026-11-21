// macOS: VMP must be applied before Apple codesign, i.e. in afterPack.
const { signVmp } = require('../vmp-sign')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') signVmp(context.appOutDir)
}
