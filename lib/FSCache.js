'use strict';

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

const fs = require('./utils/fs');
const path = require('path');
const md5 = require('./utils/md5');
const objectHash = require('./utils/objectHash');
const pkg = require('../package.json');
const logger = require('./Logger');

// These keys can affect the output, so if they differ, the cache should not match
const OPTION_KEYS = ['publicURL', 'minify', 'hmr', 'target'];

class FSCache {
  constructor(options) {
    this.dir = path.resolve(options.cacheDir || '.cache');
    this.dirExists = false;
    this.invalidated = new Set();
    this.optionsHash = objectHash(
      OPTION_KEYS.reduce((p, k) => ((p[k] = options[k]), p), {
        version: pkg.version
      })
    );
  }

  ensureDirExists() {
    var _this = this;

    return _asyncToGenerator(function*() {
      yield fs.mkdirp(_this.dir);
      _this.dirExists = true;
    })();
  }

  getCacheFile(filename) {
    let hash = md5(this.optionsHash + filename);
    return path.join(this.dir, hash + '.json');
  }

  writeDepMtimes(data) {
    return _asyncToGenerator(function*() {
      // Write mtimes for each dependent file that is already compiled into this asset
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (
          var _iterator = data.dependencies[Symbol.iterator](), _step;
          !(_iteratorNormalCompletion = (_step = _iterator.next()).done);
          _iteratorNormalCompletion = true
        ) {
          let dep = _step.value;

          if (dep.includedInParent) {
            let stats = yield fs.stat(dep.name);
            dep.mtime = stats.mtime.getTime();
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

  write(filename, data) {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      try {
        yield _this2.ensureDirExists();
        yield _this2.writeDepMtimes(data);
        yield fs.writeFile(_this2.getCacheFile(filename), JSON.stringify(data));
        _this2.invalidated.delete(filename);
      } catch (err) {
        logger.error('Error writing to cache', err);
      }
    })();
  }

  checkDepMtimes(data) {
    return _asyncToGenerator(function*() {
      // Check mtimes for files that are already compiled into this asset
      // If any of them changed, invalidate.
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (
          var _iterator2 = data.dependencies[Symbol.iterator](), _step2;
          !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done);
          _iteratorNormalCompletion2 = true
        ) {
          let dep = _step2.value;

          if (dep.includedInParent) {
            let stats = yield fs.stat(dep.name);
            if (stats.mtime > dep.mtime) {
              return false;
            }
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2.return) {
            _iterator2.return();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      return true;
    })();
  }

  read(filename) {
    var _this3 = this;

    return _asyncToGenerator(function*() {
      if (_this3.invalidated.has(filename)) {
        return null;
      }

      let cacheFile = _this3.getCacheFile(filename);

      try {
        let stats = yield fs.stat(filename);
        let cacheStats = yield fs.stat(cacheFile);

        if (stats.mtime > cacheStats.mtime) {
          return null;
        }

        let json = yield fs.readFile(cacheFile);
        let data = JSON.parse(json);
        if (!(yield _this3.checkDepMtimes(data))) {
          return null;
        }

        return data;
      } catch (err) {
        return null;
      }
    })();
  }

  invalidate(filename) {
    this.invalidated.add(filename);
  }

  delete(filename) {
    var _this4 = this;

    return _asyncToGenerator(function*() {
      try {
        yield fs.unlink(_this4.getCacheFile(filename));
        _this4.invalidated.delete(filename);
      } catch (err) {
        // Fail silently
      }
    })();
  }
}

module.exports = FSCache;