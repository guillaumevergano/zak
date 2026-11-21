// Windows: VMP must be applied after Authenticode signing, i.e. in afterSign.
const { signVmp } = require('../vmp-sign')

exports.default = async function afterSign(context) {
  if (context.electronPlatformName === 'win32') signVmp(context.appOutDir)
}
