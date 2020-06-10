const {config, Entry} = require('@secrez/core')

class Mkdir extends require('../Command') {

  setHelpAndCompletion() {
    this.cliConfig.completion.mkdir = {
      _func: this.pseudoFileCompletion(this),
      _self: this
    }
    this.cliConfig.completion.help.mkdir = true
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
      }
    ]
  }

  help() {
    return {
      description: ['Creates a directory.'],
      examples: [
        'mkdir cryptos',
        'mkdir coin/tron/wallet',
        'mkdir ../other\\ people',
        'mkdir "super folder"'
      ]
    }
  }

  async mkdir(options = {}) {
    options.type = config.types.DIR
    return await this.internalFs.make(options)
  }

  async exec(options = {}) {
    if (options.help) {
      return this.showHelp()
    }
    if (!options.path) {
      this.Logger.red('Directory path not specified.')
    } else {
      try {
        let sanitizedPath = Entry.sanitizePath(options.path)
        if (sanitizedPath !== options.path) {
          throw new Error('A filename cannot contain \\/><|:&?* chars.')
        }
        await this.mkdir(options)
        this.Logger.grey(`New folder "${options.path}" created.`)
      } catch (e) {
        this.Logger.red(e.message)
      }
    }
    this.prompt.run()
  }
}

module.exports = Mkdir


