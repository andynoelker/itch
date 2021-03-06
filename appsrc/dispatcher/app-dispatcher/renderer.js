
let os = require('../../util/os')
if (os.process_type() !== 'renderer') {
  throw new Error(`app-dispatcher/renderer required from ${os.process_type()}`)
}

let Log = require('../../util/log')
let log = Log('dispatcher')
let opts = {logger: new Log.Logger({sinks: {console: !!process.env.MARCO_POLO}})}

let electron = require('electron')
let ipc = electron.ipcRenderer

class RendererDispatcher {
  constructor () {
    this._callbacks = {}
  }

  register (name, cb) {
    if (typeof name !== 'string') {
      throw new Error('Invalid store registration (non-string name)')
    }
    if (this._callbacks[name]) {
      throw new Error(`Can't register store twice (renderer-side): ${name}`)
    }
    log(opts, `Registering store ${name} renderer-side`)
    this._callbacks[name] = cb
  }

  dispatch (payload) {
    ipc.send('dispatcher-to-browser', payload)
  }
}

let self = new RendererDispatcher()

ipc.on('dispatcher-to-renderer', (ev, payload) => {
  Object.keys(self._callbacks).forEach((store_id) => {
    let cb = self._callbacks[store_id]
    cb(payload)
  })
})

module.exports = self
