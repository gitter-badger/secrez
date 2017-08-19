const path = require('path')
const pkg = require('../package')
const fs = require('./utils/fs')
const Crypto = require('./utils/Crypto')
const Manifest = require('./models/Manifest')
const Secret = require('./models/Secret')
const Db = require('./utils/Db')
const {status, errors, keys, DEFSALT} = require('./config/constants')
const {CONSTRUCTED, INITIATED, READY, OPERATIVE} = status

class Secrez {

  constructor(datadir) {

    this.db = new Db
    this.datadir = path.join(datadir || process.env.DATADIR || process.env.HOME, '.secrez')
    this.db.init(path.join(this.datadir, 'database'))
    this.set(CONSTRUCTED)
  }

  init() {

    // console.log('init this.status', this.status)
    if (this.status === CONSTRUCTED) {
      return Promise.resolve()
          .then(() => fs.ensureDirAsync(this.datadir))
          .then(() => {
            const readmePath = path.join(this.datadir, 'README')
            if (!fs.existsSync(readmePath)) {
              return fs.ensureDirAsync(this.datadir)
                  .then(() => {
                    return fs.writeFileAsync(path.join(this.datadir, 'README'), `
This folder has been generated by Secrez v${pkg.version}.
It contains your secret's database. 
Be careful and don't touch anything!
`, 'utf-8')
                  })
            }
            else return Promise.resolve()
          })
          .then(() => {
            this.manifest = new Manifest(this.db)
            this.set(INITIATED)
            return this.getEncryptedMasterKey()
          })
          // .catch(err => console.error(err.stack))
    } else if (this.status === INITIATED) {
      return this.getEncryptedMasterKey()
    } else {
      return Promise.resolve(false)
    }
  }

  getEncryptedMasterKey() {

    return this.db.get(keys.MASTERKEY)
        .then(key => {
          if (key) {
            this.encryptedMasterKey = key
            this.set(READY)
          }
          return Promise.resolve()
        })
  }

  // gitInit(remoteRepo) {
  //   // TODO
  //   // associate the store to a remote repo
  //   return Promise.resolve()
  //       .then(() => {
  //
  //         if (fs.existsSync(path.join(this.datadir, '.git'))) {
  //           // repo exists
  //           return Promise.reject(errors.RepoExists)
  //         } else {
  //           // associate the remoteRepo
  //
  //           return Promise.resolve()
  //         }
  //       })
  // }

  set (status) {
    this.status = status
  }

  is(status) {
    return this.status === status
  }

  signup(password) {
    if (this.isInitiated()) {
      let masterKey
      return Promise.resolve(Crypto.getRandomString(64))
          .then(randomString => {
            masterKey = randomString
            return Promise.resolve(this.hashPassword(password))
          })
          .then(hashedPassword => Promise.resolve(Crypto.toAES(masterKey, hashedPassword)))
          .then(encryptedMasterKey => {
            this.encryptedMasterKey = encryptedMasterKey
            return this.db.put(keys.MASTERKEY, encryptedMasterKey)
          })
          .then(() => this.manifest.init(masterKey))
          .then(() => Promise.resolve(this.set(OPERATIVE)))
    } else {
      return Promise.reject(errors.NotInitialized)
    }
  }

  login(password) {
    if (this.isReady()) {
      return Promise.resolve(this.hashPassword(password))
          .then(hashedPassword => Promise.resolve(Crypto.fromAES(this.encryptedMasterKey, hashedPassword)))
          .then(key => {
            this.manifest = new Manifest(this.db)
            return this.manifest.init(key)
          })
          .then(() => Promise.resolve(this.set(OPERATIVE)))
    } else {
      return Promise.reject(errors.NotReady)
    }
  }

  logout() {
    if (this.isOperative()) {
      delete this.manifest
      this.set(CONSTRUCTED)
      return this.init()
          .then(() => {
            // console.log('logout this.status', this.status)
            return Promise.resolve()
          })
    } else {
      return Promise.resolve(errors.NotOperative)
    }
  }

  hashPassword(password) {
    return Promise.resolve(Crypto.deriveKey(password, DEFSALT))
  }

  ls(params) {
    return Promise.resolve(this.manifest.ls(params))
  }

  setSecret(options) {
    return this.manifest.setSecret(options)
  }

  getSecret(id) {
    if (Db.isValidId(id)) {
      return this.manifest.getSecret(id)
    } else {
      return Promise.reject(errors.InvalidID)
    }
  }

  onClose() {
    this.manifest.onClose()
    delete this.manifest
    delete this.db
  }

  isReady() {
    return this.is(READY)
  }

  isInitiated() {
    return this.is(INITIATED)
  }

  isOperative() {
    return this.is(OPERATIVE)
  }

  static defaultSecretContentFields() {
    return Secret.contentFields()
  }
}

module.exports = Secrez