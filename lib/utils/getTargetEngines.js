'use strict';

/**
 * Loads target node and browser versions from the following locations:
 *   - package.json engines field
 *   - package.json browserslist field
 *   - browserslist or .browserslistrc files
 *   - .babelrc or .babelrc.js files with babel-preset-env
 */
let getTargetEngines = (() => {
  var _ref = _asyncToGenerator(function*(asset, isTargetApp) {
    let targets = {};
    let path = isTargetApp ? asset.options.mainFile : asset.name;
    let compileTarget =
      asset.options.target === 'browser' ? 'browsers' : asset.options.target;
    let pkg = yield asset.getConfig(['package.json'], {path});
    let engines = pkg && pkg.engines;
    let nodeVersion = engines && getMinSemver(engines.node);

    if (compileTarget === 'node') {
      // Use package.engines.node by default if we are compiling for node.
      if (typeof nodeVersion === 'string') {
        targets.node = nodeVersion;
      }
    } else {
      if (
        engines &&
        (typeof engines.browsers === 'string' ||
          Array.isArray(engines.browsers))
      ) {
        targets.browsers = engines.browsers;
      } else if (pkg && pkg.browserslist) {
        targets.browsers = pkg.browserslist;
      } else {
        let browserslist = yield loadBrowserslist(asset, path);
        if (browserslist) {
          targets.browsers = browserslist;
        } else {
          let babelTargets = yield loadBabelrc(asset, path);
          if (babelTargets && babelTargets.browsers) {
            targets.browsers = babelTargets.browsers;
          } else if (babelTargets && babelTargets.node && !nodeVersion) {
            nodeVersion = babelTargets.node;
          }
        }
      }

      // Fall back to package.engines.node for node_modules without any browser target info.
      if (
        !isTargetApp &&
        !targets.browsers &&
        typeof nodeVersion === 'string'
      ) {
        targets.node = nodeVersion;
      }
    }

    // If we didn't find any targets, set some default engines for the target app.
    if (
      isTargetApp &&
      !targets[compileTarget] &&
      DEFAULT_ENGINES[compileTarget]
    ) {
      targets[compileTarget] = DEFAULT_ENGINES[compileTarget];
    }

    // Parse browser targets
    if (targets.browsers) {
      if (
        typeof targets.browsers === 'object' &&
        !Array.isArray(targets.browsers)
      ) {
        let env = asset.options.production
          ? 'production'
          : process.env.NODE_ENV || 'development';
        targets.browsers = targets.browsers[env] || targets.browsers.defaults;
      }

      if (targets.browsers) {
        targets.browsers = browserslist(targets.browsers).sort();
      }
    }

    // Dont compile if we couldn't find any targets
    if (Object.keys(targets).length === 0) {
      return null;
    }

    return targets;
  });

  return function getTargetEngines(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

let loadBrowserslist = (() => {
  var _ref2 = _asyncToGenerator(function*(asset, path) {
    let config = yield asset.getConfig(['browserslist', '.browserslistrc'], {
      path,
      load: false
    });

    if (config) {
      return browserslist.readConfig(config);
    }
  });

  return function loadBrowserslist(_x3, _x4) {
    return _ref2.apply(this, arguments);
  };
})();

let loadBabelrc = (() => {
  var _ref3 = _asyncToGenerator(function*(asset, path) {
    let config = yield asset.getConfig(['.babelrc', '.babelrc.js'], {path});
    if (config && config.presets) {
      let env = config.presets.find(function(plugin) {
        return (
          Array.isArray(plugin) &&
          (plugin[0] === 'env' || plugin[0] === '@babel/env')
        );
      });
      if (env && env[1] && env[1].targets) {
        return env[1].targets;
      }
    }
  });

  return function loadBabelrc(_x5, _x6) {
    return _ref3.apply(this, arguments);
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

const browserslist = require('browserslist');
const semver = require('semver');

const DEFAULT_ENGINES = {
  browsers: ['> 1%', 'last 2 versions', 'Firefox ESR'],
  node: '6'
};

function getMinSemver(version) {
  try {
    let range = new semver.Range(version);
    let sorted = range.set.sort((a, b) => a[0].semver.compare(b[0].semver));
    return sorted[0][0].semver.version;
  } catch (err) {
    return null;
  }
}

module.exports = getTargetEngines;