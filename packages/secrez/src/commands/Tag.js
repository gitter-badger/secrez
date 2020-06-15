const _ = require('lodash')
const {chalk} = require('../utils/Logger')
const Case = require('case')
const {Node} = require('@secrez/fs')

class Tag extends require('../Command') {

  setHelpAndCompletion() {
    this.cliConfig.completion.tag = {
      _func: this.pseudoFileCompletion(this),
      _self: this
    }
    this.cliConfig.completion.help.tag = true
    this.optionDefinitions = [
      {
        name: 'help',
        alias: 'h',
        type: Boolean
      },
      {
        name: 'path',
        alias: 'p',
        defaultOption: true,
        type: String
      },
      {
        name: 'list',
        alias: 'l',
        type: Boolean
      },
      {
        name: 'show',
        alias: 's',
        multiple: true,
        type: String
      },
      {
        name: 'add',
        alias: 'a',
        multiple: true,
        type: String
      },
      {
        name: 'remove',
        alias: 'r',
        type: Boolean
      },
      {
        name: 'find',
        type: String
      },
      {
        name: 'content-too',
        type: Boolean
      }
    ]
  }

  help() {
    return {
      description: [
        'Tags a file and shows existent tags.'
      ],
      examples: [
        'tag ethWallet.yml -a wallet,ethereum',
        ['tag ethWallet.yml -r ethereum', 'removes tag "ethereum"'],
        ['tag -l', 'lists all tags'],
        ['tag', 'lists all tags'],
        ['tag -s wallet', 'lists all files tagged wallet'],
        ['tag -s email cloud', 'lists all files tagged email and cloud']
      ]
    }
  }

  async tag(options, nodes) {
    let result = []
    if (!Object.keys(options).length) {
      options.list = true
    }
    if (options.list) {
      return this.internalFs.tree.listTags()
    } else if (options.show) {
      result = this.internalFs.tree.getNodesByTag(options.show)
      if (!result.length) {
        throw new Error('Tagged files not found')
      }
      return result
    } else if (nodes || options.path || options.find) {
      if (!nodes) {
        if (options.find) {
          options.getNodes = true
          options.name = options.find
          options.content = options.contentToo
          nodes = (await this.prompt.commands.find.find(options)).filter(n => Node.isFile(n))
        } else {
          nodes = await this.internalFs.pseudoFileCompletion(options.path, null, true)
        }
      }
      const isSaveEnabled = this.internalFs.tree.isSaveEnabled()
      if (isSaveEnabled) {
        // it's called from another command, like Import
        this.internalFs.tree.disableSave()
      }
      for (let node of nodes) {
        if (options.add) {
          await this.internalFs.tree.addTag(node, options.add.map(e => Case.snake(_.trim(e))))
          let s = options.add.length > 1 ? 's' : ''
          result = [`Tag${s} added`]
        } else if (options.remove) {
          await this.internalFs.tree.removeTag(node, options.remove.map(e => Case.snake(_.trim(e))))
          let s = options.remove.length > 1 ? 's' : ''
          result = [`Tag${s} removed`]
        }
      }
      if (isSaveEnabled) {
        this.internalFs.tree.enableSave()
        this.internalFs.tree.saveTags()
      }
      return result
    }
    throw new Error('Insufficient parameters')
  }

  formatResult(result) {
    const cols = process.stdout.columns
        || 80 // workaround for lerna testing

    let max = 0
    let mak = 0
    for (let r of result) {
      max = Math.max(max, r[0].length)
      mak = Math.max(mak, r[1].length)
    }

    if (max + mak + 2 > cols) {
      return result.map(e => e[0] + '\n' + chalk.cyan(e[1]))
    } else {
      return result.map(e => e[0] + ' '.repeat(max - e[0].length) + '  ' + chalk.cyan(e[1]))
    }
  }

  async exec(options = {}) {
    if (options.help) {
      return this.showHelp()
    }
    try {
      let result = await this.tag(options)
      if (options.list) {
        this.Logger.cyan(this.prompt.commandPrompt.formatList(result, 26, true, this.threeRedDots()))
      } else if (options.show) {
        for (let r of this.formatResult(result)) {
          this.Logger.reset(r)
        }
      } else {
        for (let r of result) {
          this.Logger.grey(r)
        }
      }
    } catch (e) {
      this.Logger.red(e.message)
    }
    this.prompt.run()
  }
}

module.exports = Tag


