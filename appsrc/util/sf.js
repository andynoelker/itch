
let Promise = require('bluebird')
let noop = require('./noop')

// let's patch all the things! Electron randomly decides to
// substitute 'fs' with their own version that considers '.asar'
// files to be read-only directories
// since itch can install applications that have .asar files, that
// won't do. we want sf to operate on actual files, so we need
// to operate some magic for various modules to use the original file system,
// not the Electron-patched one.

let fs_name = 'original-fs'
if (!process.versions.electron) {
  // when running tests, we don't have access to original-fs
  fs_name = 'fs'
}

let proxyquire = require('proxyquire')

let fs = Object.assign({}, require(fs_name), {
  '@global': true, /* Work with transitive imports */
  '@noCallThru': true, /* Don't even require/hit electron fs */
  disableGlob: true /* Don't ever use globs with rimraf */
})

// graceful-fs fixes a few things https://www.npmjs.com/package/graceful-fs
// notably, EMFILE, EPERM, etc.
let graceful_fs = Object.assign({}, proxyquire('graceful-fs', {fs}), {
  '@global': true, /* Work with transitive imports */
  '@noCallThru': true /* Don't even require/hit electron fs */
})

// when proxyquired modules load, they'll require what we give
// them instead of
let stubs = {
  'fs': graceful_fs,
  'graceful-fs': graceful_fs
}

let debug_level = ~~process.env.INCENTIVE_MET || -1
let debug = (level, parts) => {
  if (debug_level < level) {
    return
  }

  console.log(`[sf] ${parts.join(' ')}`)
}

fs = graceful_fs

// adds 'xxxAsync' variants of all fs functions, which we'll use
Promise.promisifyAll(fs)

// single function, callback-based, can't specify fs
let glob = Promise.promisify(proxyquire('glob', stubs))

// single function, callback-based, can't specify fs
let mkdirp = Promise.promisify(proxyquire('mkdirp', stubs))

// single function, callback-based, doesn't accept fs
let read_chunk = Promise.promisify(proxyquire('read-chunk', stubs))

// other deps
let path = require('path')

// global ignore patterns
let ignore = [
  // on OSX, trashes exist on dmg volumes but cannot be scandir'd for some reason
  '**/.Trashes/**'
]

let concurrency = 8

/*
 * sf = backward fs, because fs itself is quite backwards
 */
let self = {
  /**
   * Returns true if file exists, false if ENOENT, throws if other error
   */
  exists: (file) => {
    pre: { // eslint-disable-line
      typeof file === 'string'
    }

    return new Promise((resolve, reject) => {
      let callback = (err) => {
        if (err) {
          if (err.code === 'ENOENT') {
            resolve(false)
          } else {
            reject(err)
          }
        } else {
          resolve(true)
        }
      }

      fs.access(file, fs.R_OK, callback)
    })
  },

  /**
   * Return utf-8 file contents as string
   */
  read_file: async (file) => {
    pre: { // eslint-disable-line
      typeof file === 'string'
    }

    return await fs.readFileAsync(file, {encoding: 'utf8'})
  },

  /**
   * Writes an utf-8 string to `file`. Creates any directory needed.
   */
  write_file: async (file, contents) => {
    pre: { // eslint-disable-line
      typeof file === 'string'
      typeof contents === 'string'
    }

    await self.mkdir(path.dirname(file))
    return await fs.writeFileAsync(file, contents)
  },

  /**
   * Turns a stream into a promise, resolves when
   * 'close' or 'end' is emitted, rejects when 'error' is
   */
  promised: async (stream) => {
    pre: { // eslint-disable-line
      typeof stream === 'object'
    }

    let p = new Promise((resolve, reject) => {
      stream.on('close', resolve)
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    return await p
  },

  /**
   * Create each supplied directory including any necessary parent directories that
   * don't yet exist.
   *
   * If the directory already exists, do nothing.
   * Uses mkdirp: https://www.npmjs.com/package/mkdirp
   */
  mkdir: async (dir) => {
    pre: { // eslint-disable-line
      typeof dir === 'string'
    }

    return await mkdirp(dir)
  },

  /**
   * Burn to the ground an entire directory and everything in it
   * Also works on file, don't bother with unlink.
   */
  wipe: async (shelter) => {
    pre: { // eslint-disable-line
      typeof shelter === 'string'
    }

    debug(1, ['wipe', shelter])

    let stats

    try {
      stats = await self.lstat(shelter)
    } catch (err) {
      if (err.code === 'ENOENT') {
        return
      }
      throw err
    }

    if (stats.isDirectory()) {
      let file_or_dirs = await self.glob('**', {cwd: shelter, dot: true, ignore})
      let dirs = []
      let files = []

      for (let fad of file_or_dirs) {
        let full_fad = path.join(shelter, fad)

        let stats
        try {
          stats = await self.lstat(full_fad)
        } catch (err) {
          if (err.code === 'ENOENT') {
            // good!
            continue
          } else {
            throw err
          }
        }

        if (stats.isDirectory()) {
          dirs.push(fad)
        } else {
          files.push(fad)
        }
      }

      let unlink = async (file) => {
        let full_file = path.join(shelter, file)
        await self.unlink(full_file)
      }
      await Promise.resolve(files).map(unlink, {concurrency})

      // remove deeper dirs first
      dirs.sort((a, b) => (b.length - a.length))

      // needs to be done in order
      for (let dir of dirs) {
        let full_dir = path.join(shelter, dir)

        debug(2, ['rmdir', full_dir])
        await self.rmdir(full_dir)
      }

      debug(1, ['rmdir', shelter])
      await self.rmdir(shelter)
      debug(1, ['wipe', 'shelter', `done (removed ${files.length} files & ${dirs.length} directories)`])
    } else {
      debug(1, ['unlink', shelter])
      await self.unlink(shelter)
    }
  },

  /**
   * If this runs successfully, 'dst' will mirror the contents of 'src'
   * (Does not remove files that aren't in src)
   */
  ditto: async (src, dst, opts) => {
    pre: { // eslint-disable-line
      typeof src === 'string'
      typeof dst === 'string'
      typeof opts === 'object' || opts === undefined
    }

    debug(2, ['ditto', src, dst])

    if (typeof opts === 'undefined') {
      opts = {}
    }
    let onprogress = opts.onprogress || noop
    let always_false = () => false
    let should_skip = opts.should_skip || always_false
    let operation = opts.operation || 'copy'
    let move = (operation === 'move')

    let _copy = async (src_file, dst_file, stats) => {
      if (stats.isSymbolicLink()) {
        let link_target = await self.readlink(src_file)

        debug(2, ['symlink', link_target, dst_file])
        await self.wipe(dst_file)
        await self.symlink(link_target, dst_file)
      } else {
        if (move) {
          debug(2, ['rename', src_file, dst_file])
          await self.rename(src_file, dst_file)
        } else {
          // we still need to be able to read/write the file
          let mode = stats.mode & 0o777 | 0o666
          debug(2, ['cp', mode.toString(8), src_file, dst_file])
          let ws = self.createWriteStream(dst_file, {
            flags: 'w',
            /* anything is binary if you try hard enough */
            defaultEncoding: 'binary',
            mode
          })
          let rs = self.createReadStream(src_file, { encoding: 'binary' })
          let cp = self.promised(ws)
          rs.pipe(ws)
          await cp
          rs.close()
        }
      }
    }

    // if we're not a directory, no need to recurse
    let stats = await self.lstat(src)
    if (!stats.isDirectory()) {
      await _copy(src, dst, stats)
      return
    }

    // unfortunately, glob considers symlinks like directories :(
    // we can't use '**/*' as this will return paths *inside* symlinked dirs
    let files_and_dirs = await self.glob('**', {cwd: src, dot: true, ignore})

    let files = []
    let dirs = []

    for (let fad of files_and_dirs) {
      let full_fad = path.join(src, fad)
      let stats = await self.lstat(full_fad)
      if (stats.isDirectory()) {
        dirs.push(fad)
      } else {
        files.push([fad, stats])
      }
    }

    // create shallow dirs first
    dirs.sort((a, b) => (a.length - b.length))

    let mkdir = async (dir) => {
      let full_dir = path.join(dst, dir)
      debug(2, ['mkdir', full_dir])
      await self.mkdir(full_dir)
    }

    // have to mkdir sequentially
    for (let dir of dirs) {
      await mkdir(dir)
    }

    let num_done = 0

    let copy = async (arr) => {
      let file = arr[0]
      let stats = arr[1]

      if (should_skip(file)) {
        debug(2, ['skipping', file])
        return
      }

      let src_file = path.join(src, file)
      let dst_file = path.join(dst, file)
      await _copy(src_file, dst_file, stats)

      num_done += 1
      let percent = num_done * 100 / files.length
      onprogress({percent, done: num_done, total: files.length})
    }

    // can copy in parallel, all directories already exist
    await Promise.resolve(files).map(copy, {concurrency})

    debug(1, ['ditto', src, dst, `done (copied ${files.length} files & ${dirs.length} directories)`])
  },

  /**
   * Promised version of isaacs' little globber
   * https://www.npmjs.com/package/glob
   */
  glob,

  /**
   * Promised version of read_chunk
   * https://www.npmjs.com/package/read-chunk
   */
  read_chunk,

  fs_name
}

function make_bindings () {
  let mirrored = ['createReadStream', 'createWriteStream']
  for (let m of mirrored) {
    self[m] = fs[m].bind(fs)
  }

  let mirorred_async = ['chmod', 'stat', 'lstat', 'readlink', 'symlink', 'rmdir', 'unlink']
  for (let m of mirorred_async) {
    self[m] = fs[m + 'Async'].bind(fs)
  }
}
make_bindings()

module.exports = self
