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

const Parser = require('./Parser');
const path = require('path');
const md5 = require('./utils/md5');

/**
 * A Pipeline composes multiple Asset types together.
 */
class Pipeline {
  constructor(options) {
    this.options = options;
    this.parser = new Parser(options);
  }

  process(path, pkg, options) {
    var _this = this;

    return _asyncToGenerator(function*() {
      let asset = _this.parser.getAsset(path, pkg, options);
      let generated = yield _this.processAsset(asset);
      let generatedMap = {};
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (
          var _iterator = generated[Symbol.iterator](), _step;
          !(_iteratorNormalCompletion = (_step = _iterator.next()).done);
          _iteratorNormalCompletion = true
        ) {
          let rendition = _step.value;

          generatedMap[rendition.type] = rendition.value;
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

      return {
        dependencies: Array.from(asset.dependencies.values()),
        generated: generatedMap,
        hash: asset.hash,
        cacheData: asset.cacheData
      };
    })();
  }

  processAsset(asset) {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      try {
        yield asset.process();
      } catch (err) {
        throw asset.generateErrorMessage(err);
      }

      let inputType = path.extname(asset.name).slice(1);
      let generated = [];

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (
          var _iterator2 = _this2.iterateRenditions(asset)[Symbol.iterator](),
            _step2;
          !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done);
          _iteratorNormalCompletion2 = true
        ) {
          let rendition = _step2.value;
          let type = rendition.type,
            value = rendition.value;

          if (typeof value !== 'string' || rendition.final) {
            generated.push(rendition);
            continue;
          }

          // Find an asset type for the rendition type.
          // If the asset is not already an instance of this asset type, process it.
          let AssetType = _this2.parser.findParser(
            asset.name.slice(0, -inputType.length) + type
          );
          if (!(asset instanceof AssetType)) {
            let opts = Object.assign({rendition}, asset.options);
            let subAsset = new AssetType(asset.name, asset.package, opts);
            subAsset.contents = value;
            subAsset.dependencies = asset.dependencies;

            let processed = yield _this2.processAsset(subAsset);
            generated = generated.concat(processed);
            Object.assign(asset.cacheData, subAsset.cacheData);
            asset.hash = md5(asset.hash + subAsset.hash);
          } else {
            generated.push(rendition);
          }
        }

        // Post process. This allows assets a chance to modify the output produced by sub-asset types.
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

      asset.generated = generated;
      try {
        generated = yield asset.postProcess(generated);
      } catch (err) {
        throw asset.generateErrorMessage(err);
      }

      return generated;
    })();
  }

  *iterateRenditions(asset) {
    if (Array.isArray(asset.generated)) {
      return yield* asset.generated;
    }

    if (typeof asset.generated === 'string') {
      return yield {
        type: asset.type,
        value: asset.generated
      };
    }

    // Backward compatibility support for the old API.
    // Assume all renditions are final - don't compose asset types together.
    for (let type in asset.generated) {
      yield {
        type,
        value: asset.generated[type],
        final: true
      };
    }
  }
}

module.exports = Pipeline;