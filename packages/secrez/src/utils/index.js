const _ = require('lodash')
const YAML = require('yaml')
const path = require('path')
const {spawn} = require('child_process')
const parse = require('csv-parse/lib/sync')
const Case = require('case')

const utils = {

  yamlParse: str => {
    try {
      return YAML.parse(str)
    } catch (e) {
      throw new Error('Cannot parse a malformed yaml')
    }
  },

  yamlStringify: obj => {
    return YAML.stringify(obj)
  },

  isYaml: filepath => {
    try {
      let ext = path.extname(filepath)
      return /^\.y(a|)ml$/i.test(ext)
    } catch (e) {
      return false
    }
  },

  fromCsvToJson: (csv, delimiter = ',', skipEmpty = true) => {
    csv = csv.split('\n')
    let firstLine = csv[0]
    try {
      firstLine = parse(firstLine)[0].map(e => Case.snake(_.trim(e)))
    } catch (e) {
      throw new Error('The CSV is malformed')
    }
    for (let e of firstLine) {
      if (!/^[a-z]{1}[a-z0-9_]*$/.test(e)) {
        throw new Error('The header of the CSV looks wrong')
      }
    }
    csv[0] = firstLine.join(',')
    csv = csv.join('\n')
    let json = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter,
      skip_lines_with_error: true,
      trim: true
    })
    if (skipEmpty) {
      json = json.map(e => {
        let elem = {}
        for (let key in e) {
          if (e[key]) {
            elem[key] = e[key]
          }
        }
        return elem
      })
    }
    return json
  },

  fromSimpleYamlToJson: yml => {
    yml = yml.split('\n').map(e => e.split(': '))
    let json = {}
    for (let y of yml) {
      json[y[0]] = y[1]
    }
    return json
  },

  getCols: () => {
    return process.env.NODE_ENV === 'test' ? 80 : (process.stdout.columns || 80)
  },

  TRUE: () => true,

  sleep: async millis => {
    return new Promise(resolve => setTimeout(resolve, millis))
  },

  execAsync: async (cmd, cwd, params) => {
    return new Promise(resolve => {
      let json = {}
      const child = spawn(cmd, params, {
        cwd,
        shell: true
      })
      child.stdout.on('data', data => {
        json.message = _.trim(Buffer.from(data).toString('utf8'))
      })
      child.stderr.on('data', data => {
        json.error = _.trim(Buffer.from(data).toString('utf8'))
      })
      child.on('exit', code => {
        json.code = code
        resolve(json)
      })
    })
  }

}

module.exports = utils
