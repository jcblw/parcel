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

let install = (() => {
  var _ref = _asyncToGenerator(function*(modules, filepath, options = {}) {
    var _options$installPeers = options.installPeers;
    let installPeers =
      _options$installPeers === undefined ? true : _options$installPeers;
    var _options$saveDev = options.saveDev;
    let saveDev = _options$saveDev === undefined ? true : _options$saveDev,
      packageManager = options.packageManager;

    logger.status(emoji.progress, `Installing ${modules.join(', ')}...`);

    let packageLocation = yield config.resolve(filepath, ['package.json']);
    let cwd = packageLocation ? path.dirname(packageLocation) : process.cwd();

    if (!packageManager) {
      packageManager = yield determinePackageManager(filepath);
    }

    let commandToUse = packageManager === 'npm' ? 'install' : 'add';
    let args = [commandToUse, ...modules];
    if (saveDev) {
      args.push('-D');
    } else if (packageManager === 'npm') {
      args.push('--save');
    }

    // npm doesn't auto-create a package.json when installing,
    // so create an empty one if needed.
    if (packageManager === 'npm' && !packageLocation) {
      yield fs.writeFile(path.join(cwd, 'package.json'), '{}');
    }

    try {
      yield pipeSpawn(packageManager, args, {cwd});
    } catch (err) {
      throw new Error(`Failed to install ${modules.join(', ')}.`);
    }

    if (installPeers) {
      yield Promise.all(
        modules.map(function(m) {
          return installPeerDependencies(filepath, m, options);
        })
      );
    }
  });

  return function install(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

let installPeerDependencies = (() => {
  var _ref2 = _asyncToGenerator(function*(filepath, name, options) {
    let basedir = path.dirname(filepath);

    var _ref3 = yield resolve(name, {basedir}),
      _ref4 = _slicedToArray(_ref3, 1);

    const resolved = _ref4[0];

    const pkg = yield config.load(resolved, ['package.json']);
    const peers = pkg.peerDependencies || {};

    const modules = [];
    for (const peer in peers) {
      modules.push(`${peer}@${peers[peer]}`);
    }

    if (modules.length) {
      yield install(
        modules,
        filepath,
        Object.assign({}, options, {installPeers: false})
      );
    }
  });

  return function installPeerDependencies(_x3, _x4, _x5) {
    return _ref2.apply(this, arguments);
  };
})();

let determinePackageManager = (() => {
  var _ref5 = _asyncToGenerator(function*(filepath) {
    let configFile = yield config.resolve(filepath, [
      'yarn.lock',
      'package-lock.json'
    ]);
    let hasYarn = yield checkForYarnCommand();

    // If Yarn isn't available, or there is a package-lock.json file, use npm.
    let configName = configFile && path.basename(configFile);
    if (!hasYarn || configName === 'package-lock.json') {
      return 'npm';
    }

    return 'yarn';
  });

  return function determinePackageManager(_x6) {
    return _ref5.apply(this, arguments);
  };
})();

let checkForYarnCommand = (() => {
  var _ref6 = _asyncToGenerator(function*() {
    if (hasYarn != null) {
      return hasYarn;
    }

    try {
      hasYarn = yield commandExists('yarn');
    } catch (err) {
      hasYarn = false;
    }

    return hasYarn;
  });

  return function checkForYarnCommand() {
    return _ref6.apply(this, arguments);
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

const config = require('./config');
const promisify = require('./promisify');
const resolve = promisify(require('resolve'));
const commandExists = require('command-exists');
const logger = require('../Logger');
const emoji = require('./emoji');
const pipeSpawn = require('./pipeSpawn');
const PromiseQueue = require('./PromiseQueue');
const path = require('path');
const fs = require('./fs');

let hasYarn = null;

let queue = new PromiseQueue(install, {maxConcurrent: 1, retry: false});
module.exports = function(...args) {
  queue.add(...args);
  return queue.run();
};