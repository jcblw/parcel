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

const fs = require('./utils/fs');
const Resolver = require('./Resolver');
const Parser = require('./Parser');
const WorkerFarm = require('./WorkerFarm');
const Path = require('path');
const Bundle = require('./Bundle');

var _require = require('chokidar');

const FSWatcher = _require.FSWatcher;

const FSCache = require('./FSCache');
const HMRServer = require('./HMRServer');
const Server = require('./Server');

var _require2 = require('events');

const EventEmitter = _require2.EventEmitter;

const logger = require('./Logger');
const PackagerRegistry = require('./packagers');
const localRequire = require('./utils/localRequire');
const config = require('./utils/config');
const emoji = require('./utils/emoji');
const loadEnv = require('./utils/env');
const PromiseQueue = require('./utils/PromiseQueue');
const installPackage = require('./utils/installPackage');
const bundleReport = require('./utils/bundleReport');
const prettifyTime = require('./utils/prettifyTime');

/**
 * The Bundler is the main entry point. It resolves and loads assets,
 * creates the bundle tree, and manages the worker farm, cache, and file watcher.
 */
class Bundler extends EventEmitter {
  constructor(main, options = {}) {
    super();
    this.mainFile = Path.resolve(main || '');
    this.options = this.normalizeOptions(options);

    this.resolver = new Resolver(this.options);
    this.parser = new Parser(this.options);
    this.packagers = new PackagerRegistry();
    this.cache = this.options.cache ? new FSCache(this.options) : null;
    this.delegate = options.delegate || {};
    this.bundleLoaders = {};

    const loadersPath = `./builtins/loaders/${
      options.target === 'node' ? 'node' : 'browser'
    }/`;

    this.addBundleLoader('wasm', require.resolve(loadersPath + 'wasm-loader'));
    this.addBundleLoader('css', require.resolve(loadersPath + 'css-loader'));
    this.addBundleLoader('js', require.resolve(loadersPath + 'js-loader'));

    this.pending = false;
    this.loadedAssets = new Map();
    this.watchedAssets = new Map();
    this.farm = null;
    this.watcher = null;
    this.hmr = null;
    this.bundleHashes = null;
    this.errored = false;
    this.buildQueue = new PromiseQueue(this.processAsset.bind(this));
    this.rebuildTimeout = null;

    logger.setOptions(this.options);
  }

  normalizeOptions(options) {
    const isProduction =
      options.production ||
      process.env.NODE_ENV === 'production' ||
      process.env.NODE_ENV === 'staging';
    const publicURL = options.publicUrl || options.publicURL || '/';
    const watch =
      typeof options.watch === 'boolean' ? options.watch : !isProduction;
    const target = options.target || 'browser';
    return {
      production: isProduction,
      outDir: Path.resolve(options.outDir || 'dist'),
      outFile: options.outFile || '',
      publicURL: publicURL,
      watch: watch,
      cache: typeof options.cache === 'boolean' ? options.cache : true,
      cacheDir: Path.resolve(options.cacheDir || '.cache'),
      killWorkers:
        typeof options.killWorkers === 'boolean' ? options.killWorkers : true,
      minify:
        typeof options.minify === 'boolean' ? options.minify : isProduction,
      target: target,
      hmr:
        target === 'node'
          ? false
          : typeof options.hmr === 'boolean' ? options.hmr : watch,
      https: options.https || false,
      logLevel: isNaN(options.logLevel) ? 3 : options.logLevel,
      mainFile: this.mainFile,
      hmrPort: options.hmrPort || 0,
      rootDir: Path.dirname(this.mainFile),
      sourceMaps:
        typeof options.sourceMaps === 'boolean' ? options.sourceMaps : true,
      hmrHostname:
        options.hmrHostname ||
        (options.target === 'electron' ? 'localhost' : ''),
      detailedReport: options.detailedReport || false,
      autoinstall: false,
      contentHash:
        typeof options.contentHash === 'boolean'
          ? options.contentHash
          : isProduction
    };
  }

  addAssetType(extension, path) {
    if (typeof path !== 'string') {
      throw new Error('Asset type should be a module path.');
    }

    if (this.farm) {
      throw new Error('Asset types must be added before bundling.');
    }

    this.parser.registerExtension(extension, path);
  }

  addPackager(type, packager) {
    if (this.farm) {
      throw new Error('Packagers must be added before bundling.');
    }

    this.packagers.add(type, packager);
  }

  addBundleLoader(type, path) {
    if (typeof path !== 'string') {
      throw new Error('Bundle loader should be a module path.');
    }

    if (this.farm) {
      throw new Error('Bundle loaders must be added before bundling.');
    }

    this.bundleLoaders[type] = path;
  }

  loadPlugins() {
    var _this = this;

    return _asyncToGenerator(function*() {
      let pkg = yield config.load(_this.mainFile, ['package.json']);
      if (!pkg) {
        return;
      }

      try {
        let deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
        for (let dep in deps) {
          if (dep.startsWith('parcel-plugin-')) {
            let plugin = yield localRequire(dep, _this.mainFile);
            yield plugin(_this);
          }
        }
      } catch (err) {
        logger.warn(err);
      }
    })();
  }

  bundle() {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      // If another bundle is already pending, wait for that one to finish and retry.
      if (_this2.pending) {
        return new Promise(function(resolve, reject) {
          _this2.once('buildEnd', function() {
            _this2.bundle().then(resolve, reject);
          });
        });
      }

      let isInitialBundle = !_this2.mainAsset;
      let startTime = Date.now();
      _this2.pending = true;
      _this2.errored = false;

      logger.clear();
      logger.status(emoji.progress, 'Building...');

      try {
        // Start worker farm, watcher, etc. if needed
        yield _this2.start();

        // If this is the initial bundle, ensure the output directory exists, and resolve the main asset.
        if (isInitialBundle) {
          yield fs.mkdirp(_this2.options.outDir);

          _this2.mainAsset = yield _this2.resolveAsset(_this2.mainFile);
          _this2.buildQueue.add(_this2.mainAsset);
        }

        // Build the queued assets.
        let loadedAssets = yield _this2.buildQueue.run();

        // The changed assets are any that don't have a parent bundle yet
        // plus the ones that were in the build queue.
        let changedAssets = [..._this2.findOrphanAssets(), ...loadedAssets];

        // Invalidate bundles
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (
            var _iterator = _this2.loadedAssets.values()[Symbol.iterator](),
              _step;
            !(_iteratorNormalCompletion = (_step = _iterator.next()).done);
            _iteratorNormalCompletion = true
          ) {
            let asset = _step.value;

            asset.invalidateBundle();
          }

          // Create a new bundle tree
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

        _this2.mainBundle = _this2.createBundleTree(_this2.mainAsset);

        // Generate the final bundle names, and replace references in the built assets.
        _this2.bundleNameMap = _this2.mainBundle.getBundleNameMap(
          _this2.options.contentHash
        );

        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
          for (
            var _iterator2 = changedAssets[Symbol.iterator](), _step2;
            !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done);
            _iteratorNormalCompletion2 = true
          ) {
            let asset = _step2.value;

            asset.replaceBundleNames(_this2.bundleNameMap);
          }

          // Emit an HMR update if this is not the initial bundle.
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

        if (_this2.hmr && !isInitialBundle) {
          _this2.hmr.emitUpdate(changedAssets);
        }

        // Package everything up
        _this2.bundleHashes = yield _this2.mainBundle.package(
          _this2,
          _this2.bundleHashes
        );

        // Unload any orphaned assets
        _this2.unloadOrphanedAssets();

        let buildTime = Date.now() - startTime;
        let time = prettifyTime(buildTime);
        logger.status(emoji.success, `Built in ${time}.`, 'green');
        if (!_this2.watcher) {
          bundleReport(_this2.mainBundle, _this2.options.detailedReport);
        }

        _this2.emit('bundled', _this2.mainBundle);
        return _this2.mainBundle;
      } catch (err) {
        _this2.errored = true;
        logger.error(err);
        if (_this2.hmr) {
          _this2.hmr.emitError(err);
        }

        if (
          process.env.NODE_ENV === 'production' ||
          process.env.NODE_ENV === 'staging'
        ) {
          process.exitCode = 1;
        } else if (process.env.NODE_ENV === 'test' && !_this2.hmr) {
          throw err;
        }
      } finally {
        _this2.pending = false;
        _this2.emit('buildEnd');

        // If not in watch mode, stop the worker farm so we don't keep the process running.
        if (!_this2.watcher && _this2.options.killWorkers) {
          _this2.stop();
        }
      }
    })();
  }

  start() {
    var _this3 = this;

    return _asyncToGenerator(function*() {
      if (_this3.farm) {
        return;
      }

      yield _this3.loadPlugins();
      yield loadEnv(_this3.mainFile);

      _this3.options.extensions = Object.assign({}, _this3.parser.extensions);
      _this3.options.bundleLoaders = _this3.bundleLoaders;
      _this3.options.env = process.env;

      if (_this3.options.watch) {
        // FS events on macOS are flakey in the tests, which write lots of files very quickly
        // See https://github.com/paulmillr/chokidar/issues/612
        _this3.watcher = new FSWatcher({
          useFsEvents: process.env.NODE_ENV !== 'test'
        });

        _this3.watcher.on('change', _this3.onChange.bind(_this3));
      }

      if (_this3.options.hmr) {
        _this3.hmr = new HMRServer();
        _this3.options.hmrPort = yield _this3.hmr.start(_this3.options);
      }

      _this3.farm = WorkerFarm.getShared(_this3.options);
    })();
  }

  stop() {
    if (this.farm) {
      this.farm.end();
    }

    if (this.watcher) {
      this.watcher.close();
    }

    if (this.hmr) {
      this.hmr.stop();
    }
  }

  getAsset(name, parent) {
    var _this4 = this;

    return _asyncToGenerator(function*() {
      let asset = yield _this4.resolveAsset(name, parent);
      _this4.buildQueue.add(asset);
      yield _this4.buildQueue.run();
      return asset;
    })();
  }

  resolveAsset(name, parent) {
    var _this5 = this;

    return _asyncToGenerator(function*() {
      var _ref = yield _this5.resolver.resolve(name, parent);

      let path = _ref.path,
        pkg = _ref.pkg;

      if (_this5.loadedAssets.has(path)) {
        return _this5.loadedAssets.get(path);
      }

      let asset = _this5.parser.getAsset(path, pkg, _this5.options);
      _this5.loadedAssets.set(path, asset);

      _this5.watch(path, asset);
      return asset;
    })();
  }

  watch(path, asset) {
    if (!this.watcher) {
      return;
    }

    if (!this.watchedAssets.has(path)) {
      this.watcher.add(path);
      this.watchedAssets.set(path, new Set());
    }

    this.watchedAssets.get(path).add(asset);
  }

  unwatch(path, asset) {
    if (!this.watchedAssets.has(path)) {
      return;
    }

    let watched = this.watchedAssets.get(path);
    watched.delete(asset);

    if (watched.size === 0) {
      this.watchedAssets.delete(path);
      this.watcher.unwatch(path);
    }
  }

  resolveDep(asset, dep, install = true) {
    var _this6 = this;

    return _asyncToGenerator(function*() {
      try {
        return yield _this6.resolveAsset(dep.name, asset.name);
      } catch (err) {
        let thrown = err;

        if (thrown.message.indexOf(`Cannot find module '${dep.name}'`) === 0) {
          // Check if dependency is a local file
          let isLocalFile = /^[/~.]/.test(dep.name);
          let fromNodeModules = asset.name.includes(
            `${Path.sep}node_modules${Path.sep}`
          );

          // If it's not a local file, attempt to install the dep
          if (
            !isLocalFile &&
            !fromNodeModules &&
            _this6.options.autoinstall &&
            install
          ) {
            return yield _this6.installDep(asset, dep);
          }

          // If the dep is optional, return before we throw
          if (dep.optional) {
            return;
          }

          thrown.message = `Cannot resolve dependency '${dep.name}'`;
          if (isLocalFile) {
            const absPath = Path.resolve(Path.dirname(asset.name), dep.name);
            thrown.message += ` at '${absPath}'`;
          }

          yield _this6.throwDepError(asset, dep, thrown);
        }

        throw thrown;
      }
    })();
  }

  installDep(asset, dep) {
    var _this7 = this;

    return _asyncToGenerator(function*() {
      var _resolver$getModulePa = _this7.resolver.getModuleParts(dep.name),
        _resolver$getModulePa2 = _slicedToArray(_resolver$getModulePa, 1);

      let moduleName = _resolver$getModulePa2[0];

      try {
        yield installPackage([moduleName], asset.name, {saveDev: false});
      } catch (err) {
        yield _this7.throwDepError(asset, dep, err);
      }

      return yield _this7.resolveDep(asset, dep, false);
    })();
  }

  throwDepError(asset, dep, err) {
    return _asyncToGenerator(function*() {
      // Generate a code frame where the dependency was used
      if (dep.loc) {
        yield asset.loadIfNeeded();
        err.loc = dep.loc;
        err = asset.generateErrorMessage(err);
      }

      err.fileName = asset.name;
      throw err;
    })();
  }

  processAsset(asset, isRebuild) {
    var _this8 = this;

    return _asyncToGenerator(function*() {
      if (isRebuild) {
        asset.invalidate();
        if (_this8.cache) {
          _this8.cache.invalidate(asset.name);
        }
      }

      yield _this8.loadAsset(asset);
    })();
  }

  loadAsset(asset) {
    var _this9 = this;

    return _asyncToGenerator(function*() {
      if (asset.processed) {
        return;
      }

      if (!_this9.errored) {
        logger.status(emoji.progress, `Building ${asset.basename}...`);
      }

      // Mark the asset processed so we don't load it twice
      asset.processed = true;

      // First try the cache, otherwise load and compile in the background
      let startTime = Date.now();
      let processed = _this9.cache && (yield _this9.cache.read(asset.name));
      if (!processed || asset.shouldInvalidate(processed.cacheData)) {
        processed = yield _this9.farm.run(
          asset.name,
          asset.package,
          _this9.options
        );
        if (_this9.cache) {
          _this9.cache.write(asset.name, processed);
        }
      }

      asset.buildTime = Date.now() - startTime;
      asset.generated = processed.generated;
      asset.hash = processed.hash;

      // Call the delegate to get implicit dependencies
      let dependencies = processed.dependencies;
      if (_this9.delegate.getImplicitDependencies) {
        let implicitDeps = yield _this9.delegate.getImplicitDependencies(asset);
        if (implicitDeps) {
          dependencies = dependencies.concat(implicitDeps);
        }
      }

      // Resolve and load asset dependencies
      let assetDeps = yield Promise.all(
        dependencies.map(
          (() => {
            var _ref2 = _asyncToGenerator(function*(dep) {
              if (dep.includedInParent) {
                // This dependency is already included in the parent's generated output,
                // so no need to load it. We map the name back to the parent asset so
                // that changing it triggers a recompile of the parent.
                _this9.watch(dep.name, asset);
              } else {
                let assetDep = yield _this9.resolveDep(asset, dep);
                if (assetDep) {
                  yield _this9.loadAsset(assetDep);
                }

                return assetDep;
              }
            });

            return function(_x) {
              return _ref2.apply(this, arguments);
            };
          })()
        )
      );

      // Store resolved assets in their original order
      dependencies.forEach(function(dep, i) {
        asset.dependencies.set(dep.name, dep);
        let assetDep = assetDeps[i];
        if (assetDep) {
          asset.depAssets.set(dep, assetDep);
        }
      });
    })();
  }

  createBundleTree(asset, dep, bundle, parentBundles = new Set()) {
    if (dep) {
      asset.parentDeps.add(dep);
    }

    if (asset.parentBundle) {
      // If the asset is already in a bundle, it is shared. Move it to the lowest common ancestor.
      if (asset.parentBundle !== bundle) {
        let commonBundle = bundle.findCommonAncestor(asset.parentBundle);
        if (
          asset.parentBundle !== commonBundle &&
          asset.parentBundle.type === commonBundle.type
        ) {
          this.moveAssetToBundle(asset, commonBundle);
          return;
        }
      } else {
        return;
      }

      // Detect circular bundles
      if (parentBundles.has(asset.parentBundle)) {
        return;
      }
    }

    if (!bundle) {
      // Create the root bundle if it doesn't exist
      bundle = Bundle.createWithAsset(asset);
    } else if (dep && dep.dynamic) {
      // Create a new bundle for dynamic imports
      bundle = bundle.createChildBundle(asset);
    } else if (asset.type && !this.packagers.has(asset.type)) {
      // No packager is available for this asset type. Create a new bundle with only this asset.
      bundle.createSiblingBundle(asset);
    } else {
      // Add the asset to the common bundle of the asset's type
      bundle.getSiblingBundle(asset.type).addAsset(asset);
    }

    // If the asset generated a representation for the parent bundle type, also add it there
    if (asset.generated[bundle.type] != null) {
      bundle.addAsset(asset);
    }

    // Add the asset to sibling bundles for each generated type
    if (asset.type && asset.generated[asset.type]) {
      for (let t in asset.generated) {
        if (asset.generated[t]) {
          bundle.getSiblingBundle(t).addAsset(asset);
        }
      }
    }

    asset.parentBundle = bundle;
    parentBundles.add(bundle);

    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (
        var _iterator3 = asset.depAssets[Symbol.iterator](), _step3;
        !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done);
        _iteratorNormalCompletion3 = true
      ) {
        let _ref3 = _step3.value;

        var _ref4 = _slicedToArray(_ref3, 2);

        let dep = _ref4[0];
        let assetDep = _ref4[1];

        this.createBundleTree(assetDep, dep, bundle, parentBundles);
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

    parentBundles.delete(bundle);
    return bundle;
  }

  moveAssetToBundle(asset, commonBundle) {
    // Never move the entry asset of a bundle, as it was explicitly requested to be placed in a separate bundle.
    if (asset.parentBundle.entryAsset === asset) {
      return;
    }

    var _iteratorNormalCompletion4 = true;
    var _didIteratorError4 = false;
    var _iteratorError4 = undefined;

    try {
      for (
        var _iterator4 = Array.from(asset.bundles)[Symbol.iterator](), _step4;
        !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done);
        _iteratorNormalCompletion4 = true
      ) {
        let bundle = _step4.value;

        bundle.removeAsset(asset);
        commonBundle.getSiblingBundle(bundle.type).addAsset(asset);
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

    let oldBundle = asset.parentBundle;
    asset.parentBundle = commonBundle;

    // Move all dependencies as well
    var _iteratorNormalCompletion5 = true;
    var _didIteratorError5 = false;
    var _iteratorError5 = undefined;

    try {
      for (
        var _iterator5 = asset.depAssets.values()[Symbol.iterator](), _step5;
        !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done);
        _iteratorNormalCompletion5 = true
      ) {
        let child = _step5.value;

        if (child.parentBundle === oldBundle) {
          this.moveAssetToBundle(child, commonBundle);
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
  }

  *findOrphanAssets() {
    var _iteratorNormalCompletion6 = true;
    var _didIteratorError6 = false;
    var _iteratorError6 = undefined;

    try {
      for (
        var _iterator6 = this.loadedAssets.values()[Symbol.iterator](), _step6;
        !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done);
        _iteratorNormalCompletion6 = true
      ) {
        let asset = _step6.value;

        if (!asset.parentBundle) {
          yield asset;
        }
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
  }

  unloadOrphanedAssets() {
    var _iteratorNormalCompletion7 = true;
    var _didIteratorError7 = false;
    var _iteratorError7 = undefined;

    try {
      for (
        var _iterator7 = this.findOrphanAssets()[Symbol.iterator](), _step7;
        !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done);
        _iteratorNormalCompletion7 = true
      ) {
        let asset = _step7.value;

        this.unloadAsset(asset);
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
  }

  unloadAsset(asset) {
    this.loadedAssets.delete(asset.name);
    if (this.watcher) {
      this.unwatch(asset.name, asset);

      // Unwatch all included dependencies that map to this asset
      var _iteratorNormalCompletion8 = true;
      var _didIteratorError8 = false;
      var _iteratorError8 = undefined;

      try {
        for (
          var _iterator8 = asset.dependencies.values()[Symbol.iterator](),
            _step8;
          !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done);
          _iteratorNormalCompletion8 = true
        ) {
          let dep = _step8.value;

          if (dep.includedInParent) {
            this.unwatch(dep.name, asset);
          }
        }
      } catch (err) {
        _didIteratorError8 = true;
        _iteratorError8 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion8 && _iterator8.return) {
            _iterator8.return();
          }
        } finally {
          if (_didIteratorError8) {
            throw _iteratorError8;
          }
        }
      }
    }
  }

  onChange(path) {
    var _this10 = this;

    return _asyncToGenerator(function*() {
      let assets = _this10.watchedAssets.get(path);
      if (!assets || !assets.size) {
        return;
      }

      logger.clear();
      logger.status(emoji.progress, `Building ${Path.basename(path)}...`);

      // Add the asset to the rebuild queue, and reset the timeout.
      var _iteratorNormalCompletion9 = true;
      var _didIteratorError9 = false;
      var _iteratorError9 = undefined;

      try {
        for (
          var _iterator9 = assets[Symbol.iterator](), _step9;
          !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done);
          _iteratorNormalCompletion9 = true
        ) {
          let asset = _step9.value;

          _this10.buildQueue.add(asset, true);
        }
      } catch (err) {
        _didIteratorError9 = true;
        _iteratorError9 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion9 && _iterator9.return) {
            _iterator9.return();
          }
        } finally {
          if (_didIteratorError9) {
            throw _iteratorError9;
          }
        }
      }

      clearTimeout(_this10.rebuildTimeout);

      _this10.rebuildTimeout = setTimeout(
        _asyncToGenerator(function*() {
          yield _this10.bundle();
        }),
        100
      );
    })();
  }

  middleware() {
    this.bundle();
    return Server.middleware(this);
  }

  serve(port = 1234, https = false) {
    var _this11 = this;

    return _asyncToGenerator(function*() {
      _this11.server = yield Server.serve(_this11, port, https);
      _this11.bundle();
      return _this11.server;
    })();
  }
}

module.exports = Bundler;
Bundler.Asset = require('./Asset');
Bundler.Packager = require('./packagers/Packager');