const path = require('path')
const Utils = require('../utils')
const fs = require('fs-extra')
const pkg = require('../../package')
const config = require('.')

class ConfigUtils {

  static isValidType(type) {
    type = parseInt(type)
    for (let t in config.types) {
      if (config.types[t] === type) {
        return true
      }
    }
    return false
  }

  static setSecrez(
      config,
      container,
      localWorkingDir
  ) {
    config.root = path.basename(container)
    config.dataPath = path.join(container, 'blobs')
    config.tmpPath = path.join(container, 'tmp')
    config.workingDir = '/'
    config.localWorkingDir = localWorkingDir
    config.envPath = path.join(container, '.env')
    config.confPath = path.join(container, 'keys.json')
    fs.emptyDirSync(config.tmpPath)
    fs.ensureDirSync(config.dataPath)
    let fPath = path.join(container, 'README')
    if (!fs.existsSync(fPath)) {
      fs.writeFileSync(fPath, `
This folder has been generated by ${Utils.capitalize(pkg.name)} v${pkg.version}.
It contains your secret database. 
Be very careful, and don't touch anything :o)
`, 'utf-8')
    }
    fPath = path.join(container, '.gitignore')
    if (!fs.existsSync(fPath)) {
      fs.writeFileSync(fPath, `tmp
.env
`, 'utf-8')
    }
    return config
  }

}

module.exports = ConfigUtils
