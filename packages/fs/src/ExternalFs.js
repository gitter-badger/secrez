const _ = require('lodash')
const fs = require('fs-extra')
const path = require('path')
const {config} = require('@secrez/core')

class ExternalFs {

  getNormalizedPath(dir = '') {
    if (dir === '~') {
      dir = ''
    } else if (/^~\//.test(dir)) {
      dir = dir.replace(/^~\//, '')
    }
    let resolvedDir = path.resolve(config.localWorkingDir, dir)
    let normalized = path.normalize(resolvedDir)
    return normalized
  }

  async fileCompletion(options = {}) {
    let files = this.getDir(this.getNormalizedPath(options.path))[1]
    return files.filter(f => {
      let pre = true
      if (options.dironly) {
        pre = /\/$/.test(f)
      } else if (options.fileonly) {
        pre = !/\/$/.test(f)
      }
      if (pre && !options.all) {
        pre = !/^\./.test(f)
      }
      return pre
    })
  }

  mapDir(dir) {
    return fs.readdirSync(dir).map(e => e + (this.isDir(path.join(dir, e)) ? '/' : ''))
  }

  getDir(dir) {
    let list = []
    if (this.isDir(dir)) {
      list = this.mapDir(dir)
    } else {
      let fn = path.basename(dir)
      if (fn) {
        dir = dir.replace(/\/[^/]+$/, '/')
        if (this.isDir(dir)) {
          list = this.mapDir(dir)
        }
        let ok = false
        for (let e of list) {
          if (e.indexOf(fn) === 0) {
            ok = true
            break
          }
        }
        if (!ok) list = []
      }
    }
    return [dir, list]
  }

  isDir(dir) {
    if (fs.existsSync(dir)) {
      return fs.lstatSync(dir).isDirectory()
    }
    return false
  }

  isFile(fn) {
    if (fs.existsSync(fn)) {
      return fs.lstatSync(fn).isFile()
    }
    return false
  }

}

module.exports = ExternalFs
