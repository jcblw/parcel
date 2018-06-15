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

const URL = require('url');
const path = require('path');
const fs = require('./utils/fs');
const objectHash = require('./utils/objectHash');
const md5 = require('./utils/md5');
const isURL = require('./utils/is-url');
const config = require('./utils/config');

let ASSET_ID = 1;

/**
 * An Asset represents a file in the dependency tree. Assets can have multiple
 * parents that depend on it, and can be added to multiple output bundles.
 * The base Asset class doesn't do much by itself, but sets up an interface
 * for subclasses to implement.
 */
class Asset {
  constructor(name, pkg, options) {
    this.id = ASSET_ID++;
    this.name = name;
    this.basename = path.basename(this.name);
    this.relativeName = path.relative(options.rootDir, this.name);
    this.package = pkg || {};
    this.options = options;
    this.encoding = 'utf8';
    this.type = path.extname(this.name).slice(1);

    this.processed = false;
    this.contents = options.rendition ? options.rendition.value : null;
    this.ast = null;
    this.generated = null;
    this.hash = null;
    this.parentDeps = new Set();
    this.dependencies = new Map();
    this.depAssets = new Map();
    this.parentBundle = null;
    this.bundles = new Set();
    this.cacheData = {};
    this.buildTime = 0;
    this.bundledSize = 0;
  }

  shouldInvalidate() {
    return false;
  }

  loadIfNeeded() {
    var _this = this;

    return _asyncToGenerator(function*() {
      if (_this.contents == null) {
        _this.contents = yield _this.load();
      }
    })();
  }

  parseIfNeeded() {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      yield _this2.loadIfNeeded();
      if (!_this2.ast) {
        _this2.ast = yield _this2.parse(_this2.contents);
      }
    })();
  }

  getDependencies() {
    var _this3 = this;

    return _asyncToGenerator(function*() {
      if (
        _this3.options.rendition &&
        _this3.options.rendition.hasDependencies === false
      ) {
        return;
      }

      yield _this3.loadIfNeeded();

      if (_this3.contents && _this3.mightHaveDependencies()) {
        yield _this3.parseIfNeeded();
        yield _this3.collectDependencies();
      }
    })();
  }

  addDependency(name, opts) {
    this.dependencies.set(name, Object.assign({name}, opts));
  }

  addURLDependency(url, from = this.name, opts) {
    if (!url || isURL(url)) {
      return url;
    }

    if (typeof from === 'object') {
      opts = from;
      from = this.name;
    }

    const parsed = URL.parse(url);
    const resolved = path.resolve(path.dirname(from), parsed.pathname);
    this.addDependency(
      './' + path.relative(path.dirname(this.name), resolved),
      Object.assign({dynamic: true}, opts)
    );

    parsed.pathname = this.options.parser
      .getAsset(resolved, this.package, this.options)
      .generateBundleName();

    return URL.format(parsed);
  }

  getConfig(filenames, opts = {}) {
    var _this4 = this;

    return _asyncToGenerator(function*() {
      // Resolve the config file
      let conf = yield config.resolve(opts.path || _this4.name, filenames);
      if (conf) {
        // Add as a dependency so it is added to the watcher and invalidates
        // this asset when the config changes.
        _this4.addDependency(conf, {includedInParent: true});
        if (opts.load === false) {
          return conf;
        }

        return yield config.load(opts.path || _this4.name, filenames);
      }

      return null;
    })();
  }

  mightHaveDependencies() {
    return true;
  }

  load() {
    var _this5 = this;

    return _asyncToGenerator(function*() {
      return yield fs.readFile(_this5.name, _this5.encoding);
    })();
  }

  parse() {
    // do nothing by default
  }

  collectDependencies() {
    // do nothing by default
  }

  pretransform() {
    // do nothing by default

    return _asyncToGenerator(function*() {})();
  }

  transform() {
    // do nothing by default

    return _asyncToGenerator(function*() {})();
  }

  generate() {
    var _this6 = this;

    return _asyncToGenerator(function*() {
      return {
        [_this6.type]: _this6.contents
      };
    })();
  }

  process() {
    var _this7 = this;

    return _asyncToGenerator(function*() {
      if (!_this7.generated) {
        yield _this7.loadIfNeeded();
        yield _this7.pretransform();
        yield _this7.getDependencies();
        yield _this7.transform();
        _this7.generated = yield _this7.generate();
        _this7.hash = yield _this7.generateHash();
      }

      return _this7.generated;
    })();
  }

  postProcess(generated) {
    return _asyncToGenerator(function*() {
      return generated;
    })();
  }

  generateHash() {
    return objectHash(this.generated);
  }

  invalidate() {
    this.processed = false;
    this.contents = null;
    this.ast = null;
    this.generated = null;
    this.hash = null;
    this.dependencies.clear();
    this.depAssets.clear();
  }

  invalidateBundle() {
    this.parentBundle = null;
    this.bundles.clear();
    this.parentDeps.clear();
  }

  generateBundleName() {
    // Generate a unique name. This will be replaced with a nicer
    // name later as part of content hashing.
    return md5(this.name) + '.' + this.type;
  }

  replaceBundleNames(bundleNameMap) {
    for (let key in this.generated) {
      let value = this.generated[key];
      if (typeof value === 'string') {
        // Replace temporary bundle names in the output with the final content-hashed names.
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (
            var _iterator = bundleNameMap[Symbol.iterator](), _step;
            !(_iteratorNormalCompletion = (_step = _iterator.next()).done);
            _iteratorNormalCompletion = true
          ) {
            let _ref = _step.value;

            var _ref2 = _slicedToArray(_ref, 2);

            let name = _ref2[0];
            let map = _ref2[1];

            value = value.split(name).join(map);
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

        this.generated[key] = value;
      }
    }
  }

  generateErrorMessage(err) {
    return err;
  }
}

module.exports = Asset;