const _ = require('lodash')
const util = require('util')
const {config, Crypto, Entry} = require('@secrez/core')
const {ANCESTOR_NOT_FOUND, ENTRY_EXISTS} = require('./Messages')

class Node {

  constructor(entry, force) {

    if (!entry || entry.constructor.name !== 'Entry') {
      throw new Error('Node constructor expects an Entry instance')
    }

    let isRoot = Node.isRoot(entry)
    let isTrash = Node.isTrash(entry)

    if (!(Node.isDir(entry) || Node.isFile(entry))) {
      throw new Error('Unsupported type')
    }

    if (!force) {
      if (isTrash) {
        throw new Error('The trash node is a reserved one.')
      }

      if (entry.name === '.trash') {
        throw new Error('The name ".trash" is reserved.')
      }
    }

    let allIds = {}
    if (Node.isNode(entry.parent)) {
      allIds = Node.getRoot(entry.parent).allIds
    }

    this.type = entry.type
    this.id = isRoot ? config.specialId.ROOT
        : isTrash ? config.specialId.TRASH
            : entry.id || Crypto.getRandomId(allIds)

    if (Node.isDir(entry)) {
      this.children = {}
    }

    if (isRoot) {
      this.rnd = Crypto.getRandomId()
      this.allIds = allIds
    } else if (isTrash) {
      this.lastTs = Crypto.getTimestampWithMicroseconds().join('.')
      this.versions = {}
      this.versions[this.lastTs] = {
        name: config.specialName.TRASH,
        file: null
      }
      this.parent = entry.parent
    } else {
      if (!entry.ts || typeof entry.ts !== 'string'
          || !entry.name || typeof entry.name !== 'string'
          || !entry.encryptedName || typeof entry.encryptedName !== 'string'
      ) {
        throw new Error('Missing parameters')
      }

      if (Node.isNode(entry.parent)) {
        // a Node can be independent of a tree.
        // But if it is part of a tree, any child must have a parent
        allIds[entry.id.replace(/^_/, '')] = true
        this.parent = entry.parent
      }
      this.versions = {}
      this.lastTs = entry.ts
      this.versions[entry.ts] = {
        name: entry.name,
        file: entry.encryptedName
      }
      if (entry.content) {
        this.versions[entry.ts].content = entry.content
      }
    }
  }

  static isRoot(obj) {
    return obj.type === config.types.ROOT
  }

  static isTrash(obj) {
    return obj.type === config.types.TRASH
  }

  static isDir(node) {
    return this.isRoot(node) || this.isTrash(node) || node.type === config.types.DIR
  }

  static isFile(node) {
    return this.isText(node) || this.isBinary(node)
  }

  static isBinary(node) {
    return node.type === config.types.BINARY
  }

  static isText(node) {
    return node.type === config.types.TEXT
  }

  static isTrashed(node) {
    if (node.parent) {
      if (Node.isTrash(node.parent)) {
        return true
      } else if (node.parent.parent) {
        return Node.isTrashed(node.parent)
      }
    }
    return false
  }

  static fromJSON(json, secrez, allFiles) {
    // It takes an already parsed object to make it an instance of the class.
    // It needs the list of files on disk to correctly recover timestamps and names
    let minSize
    if (typeof json === 'string') {
      json = JSON.parse(json)
    }

    for (let c of json.c) {
      if (c.v[0]) {
        minSize = c.v[0].length
        break
      }
    }
    let files = {}
    for (let f of allFiles) {
      files[f.substring(0, minSize)] = f
    }
    json = Node.preFormat(json, secrez, files)
    let root = Node.initNode(json)
    return root
  }

  static preFormat(json, secrez, files, trash) {
    json.V = []
    for (let v of json.v) {
      if (/_/.test(v)) {
        trash = true
        json.V.push(new Entry({
          type: config.types.TRASH
        }))
      } else {
        let entry = secrez.decryptEntry(new Entry({
          encryptedName: files[v]
        }))
        let obj = entry.get(['id', 'ts', 'name'])
        if (trash) {
          obj.id = '_' + obj.id
        }
        obj.encryptedName = files[v]
        json.V.push(obj)
        delete files[v]
      }
    }
    json.V.sort(Node.sortEntry)
    if (json.c) {
      for (let c of json.c) {
        Node.preFormat(c, secrez, files, trash)
      }
    }
    return json
  }

  static sortEntry(a, b) {
    let ta = a
    let tb = b
    if (typeof a === 'object') {
      ta = a.ts
      tb = b.ts
    }
    let [A, C] = ta.split('.').map(e => parseInt(e))
    let [B, D] = tb.split('.').map(e => parseInt(e))
    return (
        A > B ? -1
            : A < B ? 1
            : C > D ? -1
                : C < D ? 1
                    : 0
    )
  }

  static initNode(json, parent) {

    let V0 = json.V[0]
    let type = V0 ? V0.type || parseInt(V0.encryptedName.substring(0, 1))
        : config.types.ROOT
    let node = new Node(new Entry({
      type,
      id: V0 ? V0.id : undefined,
      ts: V0 ? V0.ts : undefined,
      name: V0 ? V0.name : undefined,
      encryptedName: V0 ? V0.encryptedName : undefined,
      parent
    }), type === config.types.TRASH)
    for (let i = 1; i < json.V.length; i++) {
      let V = json.V[i]
      node.versions[V.ts] = {
        name: V.name,
        file: V.encryptedName
      }
    }
    if (Node.isDir(node)) {
      for (let i = 0; i < json.c.length; i++) {
        node.add(Node.initNode(json.c[i], node))
      }
    }

    return node
  }

  toCompressedJSON(
      minSize,
      verbose, // for testing purposes only
      allFiles // in a real scenario, when called by Tree, this should be passed listing all the files in config.dataPath
  ) {
    // prepare the object to be stringified and saved on disk

    const result = {
      v: []
    }

    if (Node.isRoot(this)) {
      minSize = this.calculateMinSize(allFiles)
      let trash = this.children.tra$
      delete this.children.tra$
      this.children.tra$ = trash
    }

    if (this.versions) {
      for (let ts in this.versions) {
        let version = this.versions[ts]
        let str = version.file ? version.file.substring(0, minSize) : '_'.repeat(minSize)
        if (verbose) {
          result.v.push(str + ' ' + ts + ' ' + version.name)
        } else {
          result.v.push(str)
        }
      }
      if (verbose) {
        result.id = this.id
        result.l = this.lastTs
      }
    }
    if (this.children) {
      result.c = []
      for (let id in this.children) {
        let child = this.children[id]
        result.c.push(child.toCompressedJSON(minSize, verbose))
      }
    }
    return result
  }


  toJSON() {
    // builds a not circular tree removing parents
    let node = {}
    for (let key in this) {
      if (key === 'parent') {
        continue
      }
      if (key === 'children') {
        node.children = {}
      } else {
        node[key] = this[key]
      }
    }
    delete node.parent
    if (this.children) {
      for (let id in this.children) {
        let child = this.children[id]
        node.children[id] = child.toJSON()
      }
    }
    return node
  }

  static initGenericRoot() {
    let root = new Node(
        new Entry({
          type: config.types.ROOT
        })
    )
    root.add(new Node(
        new Entry({
          type: config.types.TRASH,
          parent: root
        }), true
    ))
    return root
  }

  getAllFiles(child) {
    if (!child) {
      child = this
    }
    let result = []
    if (child.versions) {
      for (let v in child.versions) {
        if (child.versions[v].file) {
          result.push(child.versions[v].file)
        }
      }
    }
    if (child.children) {
      for (let c in child.children) {
        result = result.concat(this.getAllFiles(child.children[c]))
      }
    }
    return result
  }

  calculateMinSize(allFiles) {

    if (!allFiles) {
      allFiles = this.getAllFiles()
    }
    let min = 0
    let minSize
    let arr = {}
    LOOP: while (!minSize) {
      min++
      for (let f of allFiles) {
        let s = f.substring(0, min)
        if (arr[s]) {
          continue LOOP
        }
        arr[s] = true
      }
      return min
    }
  }

  getName(ts) {
    return this.get('name', ts)
  }

  getChildrenNames() {
    if (Node.isFile(this)) {
      throw new Error('Files do not have children')
    }
    let names = []
    for (let id in this.children) {
      names.push(this.children[id].getName())
    }
    return names
  }

  getFile(ts) {
    return this.get('file', ts)
  }

  getContent(ts) {
    return this.get('content', ts)
  }

  getVersions() {
    if (Node.isRoot(this)) {
      return []
    } else {
      return Object.keys(this.versions).sort(Node.sortEntry)
    }
  }

  get(what, ts = this.lastTs) {
    if (Node.isRoot(this)) {
      return undefined
    }
    try {
      return this.versions[ts][what]
    } catch (e) {
      throw new Error('Version not found')
    }
  }

  static getRoot(node) {
    if (Node.isRoot(node)) {
      return node
    } else {
      return Node.getRoot(node.parent)
    }
  }

  static getTrash(node) {
    return Node.getRoot(node).findChildById(config.specialId.TRASH)
  }

  static isNode(obj) {
    return typeof obj === 'object' && obj.constructor.name === 'Node'
  }

  findDirectChildByName(name) {
    if (Node.isFile(this)) {
      throw new Error('A file does not have children')
    }
    if (!name) {
      throw new Error('Name parameter is missing')
    }
    for (let c in this.children) {
      let child = this.children[c]
      if (child.getName() === name) {
        return child
      }
    }
  }

  findChildById(id) {
    if (Node.isFile(this)) {
      throw new Error('A file does not have children')
    }
    if (!id) {
      throw new Error('Id parameter is missing')
    }
    for (let c in this.children) {
      let child = this.children[c]
      if (c === id) {
        return child
      }
      if (Node.isDir(child)) {
        let found = child.findChildById(id)
        if (Node.isNode(found)) {
          return found
        }
      }
    }
  }

  getChildFromPath(p, returnCloserAncestor) {
    p = p.split('/').map(e => Entry.sanitizeName(e))
    let node
    let ancestorNode
    let index
    let name
    try {
      FOR: for (index = 0; index < p.length; index++) {
        name = p[index]
        if (index === 0) {
          switch (name) {
            case '':
            case '~':
              if (Node.isRoot(this)) {
                node = this
              } else {
                node = Node.getRoot(this)
              }
              break
            case '.':
              node = this
              break
            case '..':
              if (Node.isRoot(this)) {
                node = this
              } else {
                node = this.parent
              }
              break
            default:
              node = this.findDirectChildByName(name)
          }
        } else {
          switch (name) {
            case '~':
              throw new Error()
            case '':
            case '.':
              continue FOR
            case '..':
              if (!Node.isRoot(node)) {
                node = node.parent
              }
              break
            default:
              node = node.findDirectChildByName(name)
          }
        }
        if (!node) {
          throw new Error()
        }
        ancestorNode = node
      }
      if (returnCloserAncestor) {
        if (name === p[p.length - 1]) {
          throw new Error(ENTRY_EXISTS)
        } else {
          throw new Error(ANCESTOR_NOT_FOUND)
        }
      }
      return node
    } catch (e) {
      if (e.message === ANCESTOR_NOT_FOUND) {
        throw e
      } else if (e.message === ENTRY_EXISTS) {
        throw new Error(util.format(ENTRY_EXISTS, name))
      }
      if (returnCloserAncestor && ancestorNode) {
        return [
          ancestorNode,
          p.slice(index).join('/')
        ]
      }
      throw new Error('Path does not exist')
    }
  }

  getPathToChild(child) {

    if (!child || child.constructor.name !== 'Node') {
      throw new Error('The child is not a Node')
    }
    let p = ''
    while (child.id !== this.id) {
      p = (child.getName() || '') + (p ? '/' + p : '')
      child = child.parent
    }
    if (child.id === config.specialId.ROOT && child.rnd !== Node.getRoot(this).rnd) {
      throw new Error('The child does not below to this tree')
    }
    if (Node.isRoot(this)) {
      p = '/' + p
    }
    return p
  }

  getPath() {
    let p = ''
    let node = this
    while (node.id !== config.specialId.ROOT) {
      p = node.getName() + (p ? '/' + p : '')
      node = node.parent
    }
    return '/' + p
  }

  getOptions(ts = this.lastTs) {
    let options = {
      id: this.id,
      type: this.type,
      ts,
      parent: this.parent,
      name: this.getName(ts),
      encryptedName: this.getFile(ts)
    }
    return options
  }

  getEntry(ts) {
    return new Entry(this.getOptions(ts))
  }

  add(children) {
    if (Node.isDir(this)) {
      // a child is a Node instance
      if (!Array.isArray(children)) {
        children = [children]
      }
      for (let c of children) {
        c.parent = this
        this.children[c.id] = c
      }
    } else {
      throw new Error('The entry does not represent a folder')
    }
  }

  addVersion(entry) {
    this.versions[entry.ts] = {
      name: entry.name,
      file: entry.encryptedName || entry.file
    }
    if (entry.content) {
      this.versions[entry.ts].content = entry.content
    }
    this.lastTs = Object.keys(this.versions).sort(Node.sortEntry)[0]
    return this.lastTs
  }

  move(entry) {
    if (Node.isRoot(this)) {
      throw new Error('Root cannot be moved')
    }

    if (Node.isTrash(this)) {
      throw new Error('Trash cannot be moved')
    }

    if (Node.isTrashed(this)) {
      throw new Error('A deleted file cannot be moved')
    }

    if (entry.id !== this.id) {
      throw new Error('Id does not match')
    }

    if (!this.versions[entry.ts]) {
      this.addVersion(entry)
    }

    if (Node.isNode(entry.parent)) {
      if (entry.parent.id !== this.parent.id) {
        this.parent.removeChild(this)
        entry.parent.add(this)
      }
    }
  }

  getFromTrash(id) {
    let trash = Node.getTrash(this)
    return trash.children['_' + id]
  }

  trash(deleted) {
    let trash = Node.getTrash(this)
    let trashed = this.getFromTrash(deleted.id)
    let lastTs

    if (!trashed) {
      lastTs = Object.keys(deleted.versions).sort(Node.sortEntry)[0]
      trashed = new Node(new Entry({
        id: '_' + deleted.id,
        type: deleted.type,
        ts: lastTs,
        name: deleted.versions[lastTs].name,
        encryptedName: deleted.versions[lastTs].file
      }))
      trash.add(trashed)
      delete deleted.versions[lastTs]
    }
    for (let v in deleted.versions) {
      lastTs = trashed.addVersion(Object.assign({
            ts: v
          },
          deleted.versions[v]
      ))
    }
    trashed.lastTs = lastTs
    if (deleted.all && Node.isDir(deleted)) {
      trashed.children = deleted.children
    }
  }

  remove(version = []) {

    if (Node.isRoot(this)) {
      throw new Error('Root cannot be removed')
    }

    if (Node.isTrash(this)) {
      throw new Error('Trash cannot be removed')
    }

    if (Node.isTrashed(this)) {
      throw new Error('A deleted file cannot be deleted again')
    }

    if (this.parent) {
      if (!Array.isArray(version)) {
        version = [version]
      }
      let deleted = {
        id: this.id,
        type: this.type,
        versions: {}
      }
      if (Node.isDir(this)) {
        deleted.children = this.children
      }
      let result = []
      let deleteAll = version.length === 0
      for (let v in this.versions) {
        if (deleteAll || version.includes(Node.hashVersion(v))) {
          result.push({
            id: this.id,
            version: Node.hashVersion(v),
            name: this.versions[v].name
          })
          deleted.versions[v] = this.versions[v]
          delete this.versions[v]
        }
      }
      if (!Object.keys(this.versions).length && this.parent.children[this.id]) {
        deleted.all = true
      }

      this.trash(deleted)
      if (deleted.all) {
        this.parent.removeChild(this)
      }
      return result
    }
  }

  removeChild(child) {
    if (Node.isTrash(child)) {
      throw new Error('You cannot remove the trash node')
    }

    delete this.children[child.id]
  }

  static hashVersion(ts) {
    return Crypto.b58Hash(ts).substring(0, 4)
  }

}

module.exports = Node
