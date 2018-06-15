'use strict';

let localRequire = (() => {
  var _ref = _asyncToGenerator(function*(name, path, triedInstall = false) {
    let basedir = dirname(path);
    let key = basedir + ':' + name;
    let resolved = cache.get(key);
    if (!resolved) {
      try {
        resolved = resolve.sync(name, {basedir});
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND' && !triedInstall) {
          yield install([name], path);
          return localRequire(name, path, true);
        }
        throw e;
      }
      cache.set(key, resolved);
    }

    return require(resolved);
  });

  return function localRequire(_x, _x2) {
    return _ref.apply(this, arguments);
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

var _require = require('path');

const dirname = _require.dirname;

const resolve = require('resolve');
const install = require('./installPackage');

const cache = new Map();

module.exports = localRequire;