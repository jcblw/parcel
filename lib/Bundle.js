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

const Path = require('path');
const crypto = require('crypto');

/**
 * A Bundle represents an output file, containing multiple assets. Bundles can have
 * child bundles, which are bundles that are loaded dynamically from this bundle.
 * Child bundles are also produced when importing an asset of a different type from
 * the bundle, e.g. importing a CSS file from JS.
 */
class Bundle {
  constructor(type, name, parent) {
    this.type = type;
    this.name = name;
    this.parentBundle = parent;
    this.entryAsset = null;
    this.assets = new Set();
    this.childBundles = new Set();
    this.siblingBundles = new Set();
    this.siblingBundlesMap = new Map();
    this.offsets = new Map();
    this.totalSize = 0;
    this.bundleTime = 0;
  }

  static createWithAsset(asset, parentBundle) {
    let bundle = new Bundle(
      asset.type,
      Path.join(asset.options.outDir, asset.generateBundleName()),
      parentBundle
    );

    bundle.entryAsset = asset;
    bundle.addAsset(asset);
    return bundle;
  }

  addAsset(asset) {
    asset.bundles.add(this);
    this.assets.add(asset);
  }

  removeAsset(asset) {
    asset.bundles.delete(this);
    this.assets.delete(asset);
  }

  addOffset(asset, line) {
    this.offsets.set(asset, line);
  }

  getOffset(asset) {
    return this.offsets.get(asset) || 0;
  }

  getSiblingBundle(type) {
    if (!type || type === this.type) {
      return this;
    }

    if (!this.siblingBundlesMap.has(type)) {
      let bundle = new Bundle(
        type,
        Path.join(
          Path.dirname(this.name),
          Path.basename(this.name, Path.extname(this.name)) + '.' + type
        ),
        this
      );

      this.childBundles.add(bundle);
      this.siblingBundles.add(bundle);
      this.siblingBundlesMap.set(type, bundle);
    }

    return this.siblingBundlesMap.get(type);
  }

  createChildBundle(entryAsset) {
    let bundle = Bundle.createWithAsset(entryAsset, this);
    this.childBundles.add(bundle);
    return bundle;
  }

  createSiblingBundle(entryAsset) {
    let bundle = this.createChildBundle(entryAsset);
    this.siblingBundles.add(bundle);
    return bundle;
  }

  get isEmpty() {
    return this.assets.size === 0;
  }

  getBundleNameMap(contentHash, hashes = new Map()) {
    let hashedName = this.getHashedBundleName(contentHash);
    hashes.set(Path.basename(this.name), hashedName);
    this.name = Path.join(Path.dirname(this.name), hashedName);

    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (
        var _iterator = this.childBundles.values()[Symbol.iterator](), _step;
        !(_iteratorNormalCompletion = (_step = _iterator.next()).done);
        _iteratorNormalCompletion = true
      ) {
        let child = _step.value;

        child.getBundleNameMap(contentHash, hashes);
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

    return hashes;
  }

  getHashedBundleName(contentHash) {
    // If content hashing is enabled, generate a hash from all assets in the bundle.
    // Otherwise, use a hash of the filename so it remains consistent across builds.
    let ext = Path.extname(this.name);
    let hash = (contentHash
      ? this.getHash()
      : Path.basename(this.name, ext)
    ).slice(-8);
    let entryAsset = this.entryAsset || this.parentBundle.entryAsset;
    let name = Path.basename(entryAsset.name, Path.extname(entryAsset.name));
    let isMainEntry = entryAsset.name === entryAsset.options.mainFile;
    let isEntry =
      isMainEntry || Array.from(entryAsset.parentDeps).some(dep => dep.entry);

    // If this is the main entry file, use the output file option as the name if provided.
    if (isMainEntry && entryAsset.options.outFile) {
      name = entryAsset.options.outFile;
    }

    // If this is an entry asset, don't hash. Return a relative path
    // from the main file so we keep the original file paths.
    if (isEntry) {
      return Path.join(
        Path.relative(
          Path.dirname(entryAsset.options.mainFile),
          Path.dirname(entryAsset.name)
        ),
        name + ext
      );
    }

    // If this is an index file, use the parent directory name instead
    // which is probably more descriptive.
    if (name === 'index') {
      name = Path.basename(Path.dirname(entryAsset.name));
    }

    // Add the content hash and extension.
    return name + '.' + hash + ext;
  }

  package(bundler, oldHashes, newHashes = new Map()) {
    var _this = this;

    return _asyncToGenerator(function*() {
      if (_this.isEmpty) {
        return newHashes;
      }

      let hash = _this.getHash();
      newHashes.set(_this.name, hash);

      let promises = [];
      let mappings = [];
      if (!oldHashes || oldHashes.get(_this.name) !== hash) {
        promises.push(_this._package(bundler));
      }

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (
          var _iterator2 = _this.childBundles.values()[Symbol.iterator](),
            _step2;
          !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done);
          _iteratorNormalCompletion2 = true
        ) {
          let bundle = _step2.value;

          if (bundle.type === 'map') {
            mappings.push(bundle);
          } else {
            promises.push(bundle.package(bundler, oldHashes, newHashes));
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

      yield Promise.all(promises);
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (
          var _iterator3 = mappings[Symbol.iterator](), _step3;
          !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done);
          _iteratorNormalCompletion3 = true
        ) {
          let bundle = _step3.value;

          yield bundle.package(bundler, oldHashes, newHashes);
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

      return newHashes;
    })();
  }

  _package(bundler) {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      let Packager = bundler.packagers.get(_this2.type);
      let packager = new Packager(_this2, bundler);

      let startTime = Date.now();
      yield packager.setup();
      yield packager.start();

      let included = new Set();
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (
          var _iterator4 = _this2.assets[Symbol.iterator](), _step4;
          !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done);
          _iteratorNormalCompletion4 = true
        ) {
          let asset = _step4.value;

          yield _this2._addDeps(asset, packager, included);
        }
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

      yield packager.end();

      _this2.bundleTime = Date.now() - startTime;
      var _iteratorNormalCompletion5 = true;
      var _didIteratorError5 = false;
      var _iteratorError5 = undefined;

      try {
        for (
          var _iterator5 = _this2.assets[Symbol.iterator](), _step5;
          !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done);
          _iteratorNormalCompletion5 = true
        ) {
          let asset = _step5.value;

          _this2.bundleTime += asset.buildTime;
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
    })();
  }

  _addDeps(asset, packager, included) {
    var _this3 = this;

    return _asyncToGenerator(function*() {
      if (!_this3.assets.has(asset) || included.has(asset)) {
        return;
      }

      included.add(asset);

      var _iteratorNormalCompletion6 = true;
      var _didIteratorError6 = false;
      var _iteratorError6 = undefined;

      try {
        for (
          var _iterator6 = asset.depAssets.values()[Symbol.iterator](), _step6;
          !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done);
          _iteratorNormalCompletion6 = true
        ) {
          let depAsset = _step6.value;

          yield _this3._addDeps(depAsset, packager, included);
        }
      } catch (err) {
        _didIteratorError6 = true;
        _iteratorError6 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion6 && _iterator6.return) {
            _iterator6.return();
          }
        } finally {
          if (_didIteratorError6) {
            throw _iteratorError6;
          }
        }
      }

      yield packager.addAsset(asset);
      _this3.addAssetSize(asset, packager.getSize() - _this3.totalSize);
    })();
  }

  addAssetSize(asset, size) {
    asset.bundledSize = size;
    this.totalSize += size;
  }

  getParents() {
    let parents = [];
    let bundle = this;

    while (bundle) {
      parents.push(bundle);
      bundle = bundle.parentBundle;
    }

    return parents;
  }

  findCommonAncestor(bundle) {
    // Get a list of parent bundles going up to the root
    let ourParents = this.getParents();
    let theirParents = bundle.getParents();

    // Start from the root bundle, and find the first bundle that's different
    let a = ourParents.pop();
    let b = theirParents.pop();
    let last;
    while (a === b && ourParents.length > 0 && theirParents.length > 0) {
      last = a;
      a = ourParents.pop();
      b = theirParents.pop();
    }

    if (a === b) {
      // One bundle descended from the other
      return a;
    }

    return last;
  }

  getHash() {
    let hash = crypto.createHash('md5');
    var _iteratorNormalCompletion7 = true;
    var _didIteratorError7 = false;
    var _iteratorError7 = undefined;

    try {
      for (
        var _iterator7 = this.assets[Symbol.iterator](), _step7;
        !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done);
        _iteratorNormalCompletion7 = true
      ) {
        let asset = _step7.value;

        hash.update(asset.hash);
      }
    } catch (err) {
      _didIteratorError7 = true;
      _iteratorError7 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion7 && _iterator7.return) {
          _iterator7.return();
        }
      } finally {
        if (_didIteratorError7) {
          throw _iteratorError7;
        }
      }
    }

    return hash.digest('hex');
  }
}

module.exports = Bundle;