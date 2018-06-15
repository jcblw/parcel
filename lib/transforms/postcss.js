'use strict';

let getConfig = (() => {
  var _ref2 = _asyncToGenerator(function*(asset) {
    let config =
      asset.package.postcss ||
      (yield asset.getConfig([
        '.postcssrc',
        '.postcssrc.js',
        'postcss.config.js'
      ]));

    let enableModules =
      asset.options.rendition && asset.options.rendition.modules;
    if (!config && !asset.options.minify && !enableModules) {
      return;
    }

    config = config || {};

    let postcssModulesConfig = {
      getJSON: function getJSON(filename, json) {
        return (asset.cssModules = json);
      }
    };

    if (config.plugins && config.plugins['postcss-modules']) {
      postcssModulesConfig = Object.assign(
        config.plugins['postcss-modules'],
        postcssModulesConfig
      );
      delete config.plugins['postcss-modules'];
    }

    config.plugins = yield loadPlugins(config.plugins, asset.name);

    if (config.modules || enableModules) {
      let postcssModules = yield localRequire('postcss-modules', asset.name);
      config.plugins.push(postcssModules(postcssModulesConfig));
    }

    if (asset.options.minify) {
      config.plugins.push(
        cssnano(
          (yield asset.getConfig(['cssnano.config.js'])) || {
            // Only enable safe css transforms by default.
            // See: https://github.com/parcel-bundler/parcel/issues/698
            // Note: Remove when upgrading cssnano to v4
            // See: https://github.com/ben-eb/cssnano/releases/tag/v4.0.0-rc.0
            safe: true
          }
        )
      );
    }

    config.from = asset.name;
    config.to = asset.name;
    return config;
  });

  return function getConfig(_x2) {
    return _ref2.apply(this, arguments);
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

const localRequire = require('../utils/localRequire');
const loadPlugins = require('../utils/loadPlugins');
const postcss = require('postcss');
const cssnano = require('cssnano');

module.exports = (() => {
  var _ref = _asyncToGenerator(function*(asset) {
    let config = yield getConfig(asset);
    if (!config) {
      return;
    }

    yield asset.parseIfNeeded();
    let res = yield postcss(config.plugins).process(asset.getCSSAst(), config);

    asset.ast.css = res.css;
    asset.ast.dirty = false;
  });

  return function(_x) {
    return _ref.apply(this, arguments);
  };
})();