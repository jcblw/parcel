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

const fs = require('fs');
const path = require('path');
const Packager = require('./Packager');
const urlJoin = require('../utils/urlJoin');
const lineCounter = require('../utils/lineCounter');

const prelude = {
  source: fs
    .readFileSync(path.join(__dirname, '../builtins/prelude.js'), 'utf8')
    .trim(),
  minified: fs
    .readFileSync(path.join(__dirname, '../builtins/prelude.min.js'), 'utf8')
    .trim()
    .replace(/;$/, '')
};

class JSPackager extends Packager {
  start() {
    var _this = this;

    return _asyncToGenerator(function*() {
      _this.first = true;
      _this.dedupe = new Map();
      _this.bundleLoaders = new Set();
      _this.externalModules = new Set();

      let preludeCode = _this.options.minify
        ? prelude.minified
        : prelude.source;
      if (_this.options.target === 'electron') {
        preludeCode =
          `process.env.HMR_PORT=${
            _this.options.hmrPort
          };process.env.HMR_HOSTNAME=${JSON.stringify(
            _this.options.hmrHostname
          )};` + preludeCode;
      }
      yield _this.write(preludeCode + '({');
      _this.lineOffset = lineCounter(preludeCode);
    })();
  }

  addAsset(asset) {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      if (_this2.dedupe.has(asset.generated.js)) {
        return;
      }

      // Don't dedupe when HMR is turned on since it messes with the asset ids
      if (!_this2.options.hmr) {
        _this2.dedupe.set(asset.generated.js, asset.id);
      }

      let deps = {};
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (
          var _iterator = asset.depAssets[Symbol.iterator](), _step;
          !(_iteratorNormalCompletion = (_step = _iterator.next()).done);
          _iteratorNormalCompletion = true
        ) {
          let _ref = _step.value;

          var _ref2 = _slicedToArray(_ref, 2);

          let dep = _ref2[0];
          let mod = _ref2[1];

          // For dynamic dependencies, list the child bundles to load along with the module id
          if (dep.dynamic && _this2.bundle.childBundles.has(mod.parentBundle)) {
            let bundles = [_this2.getBundleSpecifier(mod.parentBundle)];
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
              for (
                var _iterator2 = mod.parentBundle.siblingBundles[
                    Symbol.iterator
                  ](),
                  _step2;
                !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next())
                  .done);
                _iteratorNormalCompletion2 = true
              ) {
                let child = _step2.value;

                if (!child.isEmpty) {
                  bundles.push(_this2.getBundleSpecifier(child));
                  _this2.bundleLoaders.add(child.type);
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

            bundles.push(mod.id);
            deps[dep.name] = bundles;
            _this2.bundleLoaders.add(mod.type);
          } else {
            deps[dep.name] = _this2.dedupe.get(mod.generated.js) || mod.id;

            // If the dep isn't in this bundle, add it to the list of external modules to preload.
            // Only do this if this is the root JS bundle, otherwise they will have already been
            // loaded in parallel with this bundle as part of a dynamic import.
            if (
              !_this2.bundle.assets.has(mod) &&
              (!_this2.bundle.parentBundle ||
                _this2.bundle.parentBundle.type !== 'js')
            ) {
              _this2.externalModules.add(mod);
              _this2.bundleLoaders.add(mod.type);
            }
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

      _this2.bundle.addOffset(asset, _this2.lineOffset);
      yield _this2.writeModule(
        asset.id,
        asset.generated.js,
        deps,
        asset.generated.map
      );
    })();
  }

  getBundleSpecifier(bundle) {
    let name = path.basename(bundle.name);
    if (bundle.entryAsset) {
      return [name, bundle.entryAsset.id];
    }

    return name;
  }

  writeModule(id, code, deps = {}, map) {
    var _this3 = this;

    return _asyncToGenerator(function*() {
      let wrapped = _this3.first ? '' : ',';
      wrapped +=
        id + ':[function(require,module,exports) {\n' + (code || '') + '\n},';
      wrapped += JSON.stringify(deps);
      wrapped += ']';

      _this3.first = false;
      yield _this3.write(wrapped);

      // Use the pre-computed line count from the source map if possible
      let lineCount = map && map.lineCount ? map.lineCount : lineCounter(code);
      _this3.lineOffset += 1 + lineCount;
    })();
  }

  addAssetToBundle(asset) {
    var _this4 = this;

    return _asyncToGenerator(function*() {
      if (_this4.bundle.assets.has(asset)) {
        return;
      }
      _this4.bundle.addAsset(asset);
      if (!asset.parentBundle) {
        asset.parentBundle = _this4.bundle;
      }

      // Add all dependencies as well
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (
          var _iterator3 = asset.depAssets.values()[Symbol.iterator](), _step3;
          !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done);
          _iteratorNormalCompletion3 = true
        ) {
          let child = _step3.value;

          yield _this4.addAssetToBundle(child, _this4.bundle);
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3.return) {
            _iterator3.return();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }

      yield _this4.addAsset(asset);
    })();
  }

  writeBundleLoaders() {
    var _this5 = this;

    return _asyncToGenerator(function*() {
      if (_this5.bundleLoaders.size === 0) {
        return false;
      }

      let bundleLoader = _this5.bundler.loadedAssets.get(
        require.resolve('../builtins/bundle-loader')
      );
      if (_this5.externalModules.size > 0 && !bundleLoader) {
        bundleLoader = yield _this5.bundler.getAsset('_bundle_loader');
      }

      if (bundleLoader) {
        yield _this5.addAssetToBundle(bundleLoader);
      } else {
        return;
      }

      // Generate a module to register the bundle loaders that are needed
      let loads = 'var b=require(' + bundleLoader.id + ');';
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (
          var _iterator4 = _this5.bundleLoaders[Symbol.iterator](), _step4;
          !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done);
          _iteratorNormalCompletion4 = true
        ) {
          let bundleType = _step4.value;

          let loader = _this5.options.bundleLoaders[bundleType];
          if (loader) {
            let asset = yield _this5.bundler.getAsset(loader);
            yield _this5.addAssetToBundle(asset);
            loads +=
              'b.register(' +
              JSON.stringify(bundleType) +
              ',require(' +
              asset.id +
              '));';
          }
        }

        // Preload external modules before running entry point if needed
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4.return) {
            _iterator4.return();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }

      if (_this5.externalModules.size > 0) {
        let preload = [];
        var _iteratorNormalCompletion5 = true;
        var _didIteratorError5 = false;
        var _iteratorError5 = undefined;

        try {
          for (
            var _iterator5 = _this5.externalModules[Symbol.iterator](), _step5;
            !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done);
            _iteratorNormalCompletion5 = true
          ) {
            let mod = _step5.value;

            // Find the bundle that has the module as its entry point
            let bundle = Array.from(mod.bundles).find(function(b) {
              return b.entryAsset === mod;
            });
            if (bundle) {
              preload.push([path.basename(bundle.name), mod.id]);
            }
          }
        } catch (err) {
          _didIteratorError5 = true;
          _iteratorError5 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion5 && _iterator5.return) {
              _iterator5.return();
            }
          } finally {
            if (_didIteratorError5) {
              throw _iteratorError5;
            }
          }
        }

        if (_this5.bundle.entryAsset) {
          preload.push(_this5.bundle.entryAsset.id);
        }

        loads += 'b.load(' + JSON.stringify(preload) + ');';
      }

      // Asset ids normally start at 1, so this should be safe.
      yield _this5.writeModule(0, loads, {});
      return true;
    })();
  }

  end() {
    var _this6 = this;

    return _asyncToGenerator(function*() {
      let entry = [];

      // Add the HMR runtime if needed.
      if (_this6.options.hmr) {
        let asset = yield _this6.bundler.getAsset(
          require.resolve('../builtins/hmr-runtime')
        );
        yield _this6.addAssetToBundle(asset);
        entry.push(asset.id);
      }

      if (yield _this6.writeBundleLoaders()) {
        entry.push(0);
      }

      if (_this6.bundle.entryAsset && _this6.externalModules.size === 0) {
        entry.push(_this6.bundle.entryAsset.id);
      }

      yield _this6.write('},{},' + JSON.stringify(entry) + ')');
      if (_this6.options.sourceMaps) {
        // Add source map url
        yield _this6.write(
          `\n//# sourceMappingURL=${urlJoin(
            _this6.options.publicURL,
            path.basename(_this6.bundle.name, '.js') + '.map'
          )}`
        );
      }
      yield _this6.dest.end();
    })();
  }
}

module.exports = JSPackager;