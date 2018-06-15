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

const Asset = require('../Asset');
const localRequire = require('../utils/localRequire');

class CoffeeScriptAsset extends Asset {
  constructor(name, pkg, options) {
    super(name, pkg, options);
    this.type = 'js';
  }

  generate() {
    var _this = this;

    return _asyncToGenerator(function*() {
      // require coffeescript, installed locally in the app
      let coffee = yield localRequire('coffeescript', _this.name);

      // Transpile Module using CoffeeScript and parse result as ast format through babylon
      let transpiled = coffee.compile(_this.contents, {
        sourceMap: _this.options.sourceMaps
      });

      let sourceMap;
      if (transpiled.sourceMap) {
        sourceMap = transpiled.sourceMap.generate();
        sourceMap.sources = [_this.relativeName];
        sourceMap.sourcesContent = [_this.contents];
      }

      return [
        {
          type: 'js',
          value: _this.options.sourceMaps ? transpiled.js : transpiled,
          sourceMap
        }
      ];
    })();
  }
}

module.exports = CoffeeScriptAsset;