const chai = require('chai')
const assert = chai.assert
const stdout = require('test-console').stdout

const fs = require('fs-extra')
const path = require('path')
const Prompt = require('../mocks/PromptMock')
const {fromSimpleYamlToJson} = require('../../src/utils')
const {assertConsole, noPrint, decolorize} = require('../helpers')

const {
  password,
  iterations
} = require('../fixtures')

// eslint-disable-next-line no-unused-vars
const jlog = require('../helpers/jlog')

describe('#Import', function () {

  let prompt
  let rootDir = path.resolve(__dirname, '../../tmp/test/.secrez')
  let fixtures = path.resolve(__dirname, '../fixtures')
  let inspect, C

  let options = {
    container: rootDir,
    localDir: path.resolve(fixtures, 'files')
  }

  beforeEach(async function () {
    await fs.emptyDir(path.resolve(__dirname, '../../tmp/test'))
    prompt = new Prompt
    await prompt.init(options)
    C = prompt.commands
    await prompt.secrez.signup(password, iterations)
    await prompt.internalFs.init()
  })

  it('should return the help', async function () {

    inspect = stdout.inspect()
    await C.import.exec({help: true})
    inspect.restore()
    let output = inspect.output.map(e => decolorize(e))
    assert.isTrue(/-h, --help/.test(output[9]))

  })

  it('should import a file in the current folder', async function () {

    let content = await C.lcat.lcat({
      path: 'file0.txt'
    })

    await noPrint(C.mkdir.exec({
      path: '/folder'
    }))
    await noPrint(C.cd.exec({
      path: '/folder'
    }))

    inspect = stdout.inspect()
    await C.import.exec({
      path: 'file0.txt'
    })
    inspect.restore()
    assertConsole(inspect, ['Imported files:', '/folder/file0.txt'])

    let newSecret = await C.cat.cat('/folder/file0.txt')
    assert.equal(newSecret[0].type, prompt.secrez.config.types.TEXT)
    assert.equal(newSecret[0].content, content)

    inspect = stdout.inspect()
    await C.import.exec({
      path: 'file0.txt'
    })
    inspect.restore()
    assertConsole(inspect, ['Imported files:', '/folder/file0.2.txt'])

    newSecret = await C.cat.cat({path: '/folder/file0.2.txt'})
    assert.equal(newSecret[0].type, prompt.secrez.config.types.TEXT)
    assert.equal(newSecret[0].content, content)

    inspect = stdout.inspect()
    await C.import.exec({
      path: 'file0.txt'
    })
    inspect.restore()
    assertConsole(inspect, ['Imported files:', '/folder/file0.3.txt'])

  })

  it('should import files recursively', async function () {

    await C.lcd.lcd({
      path: '..'
    })

    inspect = stdout.inspect()
    await C.import.exec({
      path: 'files',
      recursive: true
    })
    inspect.restore()
    assertConsole(inspect, [
      'Imported files:',
      '/file0.txt',
      '/file3',
      '/folder1/file$2',
      '/folder1/file1',
      '/folder1/folder3/file4'
    ])

  })

  it('should read a folder and import the only text file', async function () {

    let content1 = await C.lcat.lcat({
      path: 'folder1/file1'
    })
    let content2 = await C.lcat.lcat({
      path: 'folder1/file$2'
    })

    await noPrint(C.mkdir.exec({
      path: '/folder'
    }))
    await noPrint(C.cd.exec({
      path: '/folder'
    }))

    inspect = stdout.inspect()
    await C.import.exec({
      path: 'folder1'
    })
    inspect.restore()
    assertConsole(inspect, ['Imported files:', '/folder/file$2', '/folder/file1'])

    let newSecret = await C.cat.cat({path: '/folder/file1'})
    assert.equal(content1, newSecret[0].content)
    newSecret = await C.cat.cat({path: '/folder/file$2'})
    assert.equal(content2, newSecret[0].content)

  })

  it('should read a folder and import text and binary files', async function () {

    await noPrint(C.mkdir.exec({
      path: '/folder'
    }))
    await noPrint(C.cd.exec({
      path: '/folder'
    }))

    inspect = stdout.inspect()
    await C.import.exec({
      path: 'folder1',
      'binary-too': true
    })
    inspect.restore()
    assertConsole(inspect, ['Imported files:', '/folder/file$2', '/folder/file1', '/folder/file1.tar.gz'])

    let newSecret = await C.cat.cat({path: '/folder/file1.tar.gz'})
    assert.equal(newSecret[0].type, prompt.secrez.config.types.BINARY)

  })

  it('should simulate the import of two files', async function () {

    await noPrint(C.mkdir.exec({
      path: '/folder'
    }))
    await noPrint(C.cd.exec({
      path: '/folder'
    }))

    inspect = stdout.inspect()
    await C.import.exec({
      path: 'folder1',
      simulate: true
    })
    inspect.restore()
    assertConsole(inspect, ['Imported files (simulation):', '/folder/file$2', '/folder/file1'])

    try {
      await C.cat.cat({path: '/folder/file1'})
      assert.isTrue(false)
    } catch (e) {
      assert.equal(e.message, 'Path does not exist')
    }
    try {
      await C.cat.cat({path: '/folder/file$2'})
      assert.isTrue(false)
    } catch (e) {
      assert.equal(e.message, 'Path does not exist')
    }

  })

  it('should move the imported file', async function () {

    await noPrint(C.mkdir.exec({
      path: '/folder'
    }))
    await noPrint(C.cd.exec({
      path: '/folder'
    }))

    // we copy the file to be moved in order to not change the data
    let dest = path.resolve(__dirname, '../../tmp/test/file4')
    await fs.copy(path.join(options.localDir, 'file3'), dest)
    assert.isTrue(await fs.pathExists(dest))

    await C.lcd.lcd({
      path: '../../../tmp/test'
    })

    let content = await C.lcat.lcat({
      path: 'file4'
    })

    inspect = stdout.inspect()
    await C.import.exec({
      path: 'file4',
      move: true
    })
    inspect.restore()
    assertConsole(inspect, ['Imported files (moved):', '/folder/file4'])

    let newSecret = await C.cat.cat({path: '/folder/file4'})
    assert.equal(newSecret[0].type, prompt.secrez.config.types.TEXT)
    assert.equal(newSecret[0].content, content)

    assert.isFalse(await fs.pathExists(dest))

  })

  it('should import a backup from another software spanning the data among folders and files', async function () {

    await noPrint(C.mkdir.exec({
      path: '/folder'
    }))
    await noPrint(C.cd.exec({
      path: '/folder'
    }))

    inspect = stdout.inspect()
    await C.import.exec({
      path: '../some.csv',
      expand: './imported'
    })
    inspect.restore()
    assertConsole(inspect, [
      'Imported files:',
      '/folder/imported/webs/SampleEntryTitle.yml',
      '/folder/imported/passwords/twitter/Multi-Line Test Entry.yml',
      '/folder/imported/tests/Entry To Test/Special Characters.yml',
      '/folder/imported/tests/Entry To Test/JSON data/1.yml',
      '/folder/imported/webs/SampleEntryTitle.2.yml'
    ])

    let newSecret = await C.cat.cat({path: '/folder/imported/webs/SampleEntryTitle.yml', unformatted: true})
    assert.equal(newSecret[0].type, prompt.secrez.config.types.TEXT)
    let content = fromSimpleYamlToJson(newSecret[0].content)
    assert.equal(content.password, 'ycXfARD2G1AOBzLlhtbn')
    assert.equal(content.tags, 'email eth')
  })

  it('should import a backup from another software but saving the tags as tags', async function () {

    inspect = stdout.inspect()
    await C.import.exec({
      path: '../some.csv',
      expand: './imported2',
      tags: true
    })
    inspect.restore()
    assertConsole(inspect, [
      'Imported files:',
      '/imported2/webs/SampleEntryTitle.yml',
      '/imported2/passwords/twitter/Multi-Line Test Entry.yml',
      '/imported2/tests/Entry To Test/Special Characters.yml',
      '/imported2/tests/Entry To Test/JSON data/1.yml',
      '/imported2/webs/SampleEntryTitle.2.yml'
    ])

    let newSecret = await C.cat.cat({path: '/imported2/webs/SampleEntryTitle.yml', unformatted: true})
    assert.equal(newSecret[0].type, prompt.secrez.config.types.TEXT)
    let content = fromSimpleYamlToJson(newSecret[0].content)
    assert.equal(content.password, 'ycXfARD2G1AOBzLlhtbn')
    assert.isUndefined(content.tags)

    let node = prompt.internalFs.tree.root.getChildFromPath('/imported2/webs/SampleEntryTitle.yml')
    assert.equal(prompt.internalFs.tree.getTags(node).join(' '), 'email eth')

  })

  it('should import a backup from another software using tags to prefix the paths', async function () {

    inspect = stdout.inspect()
    await C.import.exec({
      path: '../some.csv',
      expand: './imported2',
      tags: true,
      'use-tags-for-paths': true
    })
    inspect.restore()
    assertConsole(inspect, [
      'Imported files:',
      '/imported2/eth/email/webs/SampleEntryTitle.yml',
      '/imported2/some/two/passwords/twitter/Multi-Line Test Entry.yml',
      '/imported2/tests/Entry To Test/Special Characters.yml',
      '/imported2/eth/web/tests/Entry To Test/JSON data/1.yml',
      '/imported2/webs/SampleEntryTitle.yml'
    ])

    let newSecret = await C.cat.cat({path: '/imported2/eth/email/webs/SampleEntryTitle.yml', unformatted: true})
    assert.equal(newSecret[0].type, prompt.secrez.config.types.TEXT)
    let content = fromSimpleYamlToJson(newSecret[0].content)
    assert.equal(content.password, 'ycXfARD2G1AOBzLlhtbn')
    assert.isUndefined(content.tags)

    let node = prompt.internalFs.tree.root.getChildFromPath('/imported2/eth/email/webs/SampleEntryTitle.yml')
    assert.equal(prompt.internalFs.tree.getTags(node).length, 2)

  })

  it('should import using tags to prefix the paths, ignoring the tags', async function () {

    inspect = stdout.inspect()
    await C.import.exec({
      path: '../some.csv',
      expand: './imported2',
      'use-tags-for-paths': true
    })
    inspect.restore()
    assertConsole(inspect, [
      'Imported files:',
      '/imported2/eth/email/webs/SampleEntryTitle.yml',
      '/imported2/some/two/passwords/twitter/Multi-Line Test Entry.yml',
      '/imported2/tests/Entry To Test/Special Characters.yml',
      '/imported2/eth/web/tests/Entry To Test/JSON data/1.yml',
      '/imported2/webs/SampleEntryTitle.yml'
    ])

    let newSecret = await C.cat.cat({path: '/imported2/eth/email/webs/SampleEntryTitle.yml', unformatted: true})
    assert.equal(newSecret[0].type, prompt.secrez.config.types.TEXT)
    let content = fromSimpleYamlToJson(newSecret[0].content)
    assert.equal(content.password, 'ycXfARD2G1AOBzLlhtbn')
    assert.isUndefined(content.tags)

    let node = prompt.internalFs.tree.root.getChildFromPath('/imported2/eth/email/webs/SampleEntryTitle.yml')
    assert.equal(prompt.internalFs.tree.getTags(node).length, 0)

  })


  it('should throw importing a malformed backup', async function () {

    inspect = stdout.inspect()
    await C.import.exec({
      path: '../bad0.csv',
      expand: './imported'
    })
    inspect.restore()
    assertConsole(inspect, ['The file does not exist'])

    inspect = stdout.inspect()
    await C.import.exec({
      path: '../bad1.csv',
      expand: './imported'
    })
    inspect.restore()
    assertConsole(inspect, ['The data misses a path field'])

    inspect = stdout.inspect()
    await C.import.exec({
      path: '../bad2.csv',
      expand: './imported'
    })
    inspect.restore()
    assertConsole(inspect, ['The data is empty'])

    inspect = stdout.inspect()
    await C.import.exec({
      path: '../bad3.csv',
      expand: './imported'
    })
    inspect.restore()
    assertConsole(inspect, ['The header of the CSV looks wrong'])


  })

})

