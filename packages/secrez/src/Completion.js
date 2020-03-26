const _ = require('lodash')
const {FsUtils} = require('@secrez/fs')

class _Completion {

  constructor(completion) {
    this.completion = completion
  }

  basicCommands() {
    if (!this.commands) {
      this.commands = []
      for (let c in this.completion) {
        this.commands.push(c)
      }
      this.commands.sort()
    }
    return this.commands
  }

  async subCommands(line = '', forceCommand) {
    // eslint-disable-next-line no-console
    console.log()

    // line = _.trim(line).replace(/ +/g, ' ')
    const params = line.split(' ')
    const normalizedParams = params.map(e => e.split('=')[0])
    const command = params[0]
    let c = this.completion[command]
    if (!c && forceCommand) {
      c = this.completion[forceCommand]
      line = forceCommand + ' ' + line
    }
    if (typeof c === 'object') {
      let commands
      let options = {}
      if (c._func) {
        let commandLine = _.trim(line).split(' ').slice(1).join(' ')
        const definitions = c._self.optionDefinitions
        options = FsUtils.parseCommandLine(definitions, commandLine, true)
        if (options._unknown) {
          options = {path: '.'}
        }
        let files = await c._func(options.path)
        commands = files
      } else {
        commands = _.filter(
            Object.keys(c),
            o => {
              return !normalizedParams.includes(o)
            }
        )
      }
      if (commands.length) {
        let prefix = [command]
        // console.log(0, prefix, params)
        for (let param of params) {
          if (c[param.split('=')[0]] || /-[a-zA-Z0-9]+/.test(param)) {
            prefix.push(param)
          }
        }
        let last = params.pop()
        if (last === command || /(=|-[a-zA-Z0-9]+)/.test(last)) {
          last = undefined
        }
        // console.log(1, prefix)
        // console.log(2, commands)
        commands = commands.map(e => `${prefix.join` `} ${last ? last.replace(/\/[^/]+/, '/') : ''}${e.replace(/ /g, '\\ ')}`)
        // console.log(3, commands)
        return commands
      }
    }
  }
}

function Completion(completion, forceCommand) {
  const instance = new _Completion(completion)

  return async line => {
    let subCommands = await instance.subCommands(line, forceCommand)
    if (subCommands) {
      return subCommands
    }
    return instance.basicCommands()
  }
}


module.exports = Completion
