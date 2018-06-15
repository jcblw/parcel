'use strict';

var _slicedToArray = (function() {
  function sliceIterator(arr, i) {
    var _arr = [];
    var _n = true;
    var _d = false;
    var _e = undefined;
    try {
      for (
        var _i = arr[Symbol.iterator](), _s;
        !(_n = (_s = _i.next()).done);
        _n = true
      ) {
        _arr.push(_s.value);
        if (i && _arr.length === i) break;
      }
    } catch (err) {
      _d = true;
      _e = err;
    } finally {
      try {
        if (!_n && _i['return']) _i['return']();
      } finally {
        if (_d) throw _e;
      }
    }
    return _arr;
  }
  return function(arr, i) {
    if (Array.isArray(arr)) {
      return arr;
    } else if (Symbol.iterator in Object(arr)) {
      return sliceIterator(arr, i);
    } else {
      throw new TypeError(
        'Invalid attempt to destructure non-iterable instance'
      );
    }
  };
})();

function _asyncToGenerator(fn) {
  return function() {
    var gen = fn.apply(this, arguments);
    return new Promise(function(resolve, reject) {
      function step(key, arg) {
        try {
          var info = gen[key](arg);
          var value = info.value;
        } catch (error) {
          reject(error);
          return;
        }
        if (info.done) {
          resolve(value);
        } else {
          return Promise.resolve(value).then(
            function(value) {
              step('next', value);
            },
            function(err) {
              step('throw', err);
            }
          );
        }
      }
      return step('next');
    });
  };
}

const path = require('path');
const commandExists = require('command-exists');
const childProcess = require('child_process');
const promisify = require('../utils/promisify');
const exec = promisify(childProcess.execFile);
const tomlify = require('tomlify-j0.4');
const fs = require('../utils/fs');
const Asset = require('../Asset');
const config = require('../utils/config');
const pipeSpawn = require('../utils/pipeSpawn');
const md5 = require('../utils/md5');

const RUST_TARGET = 'wasm32-unknown-unknown';
const MAIN_FILES = ['src/lib.rs', 'src/main.rs'];

// Track installation status so we don't need to check more than once
let rustInstalled = false;
let wasmGCInstalled = false;

class RustAsset extends Asset {
  constructor(name, pkg, options) {
    super(name, pkg, options);
    this.type = 'wasm';
  }

  process() {
    // We don't want to process this asset if the worker is in a warm up phase
    // since the asset will also be processed by the main process, which
    // may cause errors since rust writes to the filesystem.
    if (this.options.isWarmUp) {
      return;
    }

    return super.process();
  }

  parse() {
    var _this = this;

    return _asyncToGenerator(function*() {
      // Install rust toolchain and target if needed
      yield _this.installRust();

      // See if there is a Cargo config in the project
      let cargoConfig = yield _this.getConfig(['Cargo.toml']);
      let cargoDir;
      let isMainFile = false;

      if (cargoConfig) {
        const mainFiles = MAIN_FILES.slice();
        if (cargoConfig.lib && cargoConfig.lib.path) {
          mainFiles.push(cargoConfig.lib.path);
        }

        cargoDir = path.dirname(
          yield config.resolve(_this.name, ['Cargo.toml'])
        );
        isMainFile = mainFiles.some(function(file) {
          return path.join(cargoDir, file) === _this.name;
        });
      }

      // If this is the main file of a Cargo build, use the cargo command to compile.
      // Otherwise, use rustc directly.
      if (isMainFile) {
        yield _this.cargoBuild(cargoConfig, cargoDir);
      } else {
        yield _this.rustcBuild();
      }

      // If this is a prod build, use wasm-gc to remove unused code
      if (_this.options.minify) {
        yield _this.installWasmGC();
        yield exec('wasm-gc', [_this.wasmPath, _this.wasmPath]);
      }
    })();
  }

  installRust() {
    return _asyncToGenerator(function*() {
      if (rustInstalled) {
        return;
      }

      // Check for rustup
      try {
        yield commandExists('rustup');
      } catch (e) {
        throw new Error(
          "Rust isn't installed. Visit https://www.rustup.rs/ for more info"
        );
      }

      // Ensure nightly toolchain is installed

      var _ref = yield exec('rustup', ['show']),
        _ref2 = _slicedToArray(_ref, 1);

      let stdout = _ref2[0];

      if (!stdout.includes('nightly')) {
        yield pipeSpawn('rustup', ['update']);
        yield pipeSpawn('rustup', ['toolchain', 'install', 'nightly']);
      }

      // Ensure wasm target is installed

      var _ref3 = yield exec('rustup', [
        'target',
        'list',
        '--toolchain',
        'nightly'
      ]);

      var _ref4 = _slicedToArray(_ref3, 1);

      stdout = _ref4[0];

      if (!stdout.includes(RUST_TARGET + ' (installed)')) {
        yield pipeSpawn('rustup', [
          'target',
          'add',
          RUST_TARGET,
          '--toolchain',
          'nightly'
        ]);
      }

      rustInstalled = true;
    })();
  }

  installWasmGC() {
    return _asyncToGenerator(function*() {
      if (wasmGCInstalled) {
        return;
      }

      try {
        yield commandExists('wasm-gc');
      } catch (e) {
        yield pipeSpawn('cargo', [
          'install',
          '--git',
          'https://github.com/alexcrichton/wasm-gc'
        ]);
      }

      wasmGCInstalled = true;
    })();
  }

  cargoBuild(cargoConfig, cargoDir) {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      // Ensure the cargo config has cdylib as the crate-type
      if (!cargoConfig.lib) {
        cargoConfig.lib = {};
      }

      if (!Array.isArray(cargoConfig.lib['crate-type'])) {
        cargoConfig.lib['crate-type'] = [];
      }

      if (!cargoConfig.lib['crate-type'].includes('cdylib')) {
        cargoConfig.lib['crate-type'].push('cdylib');
        yield fs.writeFile(
          path.join(cargoDir, 'Cargo.toml'),
          tomlify.toToml(cargoConfig)
        );
      }

      // Run cargo
      let args = ['+nightly', 'build', '--target', RUST_TARGET, '--release'];
      yield exec('cargo', args, {cwd: cargoDir});

      // Get output file paths
      let outDir = path.join(cargoDir, 'target', RUST_TARGET, 'release');

      // Rust converts '-' to '_' when outputting files.
      let rustName = cargoConfig.package.name.replace(/-/g, '_');
      _this2.wasmPath = path.join(outDir, rustName + '.wasm');
      _this2.depsPath = path.join(outDir, rustName + '.d');
    })();
  }

  rustcBuild() {
    var _this3 = this;

    return _asyncToGenerator(function*() {
      // Get output filename
      yield fs.mkdirp(_this3.options.cacheDir);
      let name = md5(_this3.name);
      _this3.wasmPath = path.join(_this3.options.cacheDir, name + '.wasm');

      // Run rustc to compile the code
      const args = [
        '+nightly',
        '--target',
        RUST_TARGET,
        '-O',
        '--crate-type=cdylib',
        _this3.name,
        '-o',
        _this3.wasmPath
      ];
      yield exec('rustc', args);

      // Run again to collect dependencies
      _this3.depsPath = path.join(_this3.options.cacheDir, name + '.d');
      yield exec('rustc', [
        _this3.name,
        '--emit=dep-info',
        '-o',
        _this3.depsPath
      ]);
    })();
  }

  collectDependencies() {
    var _this4 = this;

    return _asyncToGenerator(function*() {
      // Read deps file
      let contents = yield fs.readFile(_this4.depsPath, 'utf8');
      let dir = path.dirname(_this4.name);

      let deps = contents
        .split('\n')
        .filter(Boolean)
        .slice(1);

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (
          var _iterator = deps[Symbol.iterator](), _step;
          !(_iteratorNormalCompletion = (_step = _iterator.next()).done);
          _iteratorNormalCompletion = true
        ) {
          let dep = _step.value;

          dep = path.resolve(dir, dep.slice(0, dep.indexOf(':')));
          if (dep !== _this4.name) {
            _this4.addDependency(dep, {includedInParent: true});
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    })();
  }

  generate() {
    var _this5 = this;

    return _asyncToGenerator(function*() {
      return {
        wasm: {
          path: _this5.wasmPath, // pass output path to RawPackager
          mtime: Date.now() // force re-bundling since otherwise the hash would never change
        }
      };
    })();
  }
}

module.exports = RustAsset;