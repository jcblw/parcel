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

var _require = require('uglify-es');

const minify = _require.minify;

const SourceMap = require('../SourceMap');

module.exports = (() => {
  var _ref = _asyncToGenerator(function*(asset) {
    yield asset.parseIfNeeded();

    // Convert AST into JS
    let source = (yield asset.generate()).js;

    let customConfig = yield asset.getConfig(['.uglifyrc']);
    let options = {
      warnings: true,
      mangle: {
        toplevel: true
      }
    };

    let sourceMap;
    if (asset.options.sourceMap) {
      sourceMap = new SourceMap();
      options.output = {
        source_map: {
          add(source, gen_line, gen_col, orig_line, orig_col, name) {
            sourceMap.addMapping({
              source,
              name,
              original: {
                line: orig_line,
                column: orig_col
              },
              generated: {
                line: gen_line,
                column: gen_col
              }
            });
          }
        }
      };
    }

    if (customConfig) {
      options = Object.assign(options, customConfig);
    }

    let result = minify(source, options);

    if (result.error) {
      throw result.error;
    }

    if (sourceMap) {
      if (asset.sourceMap) {
        asset.sourceMap = yield new SourceMap().extendSourceMap(
          asset.sourceMap,
          sourceMap
        );
      } else {
        asset.sourceMap = sourceMap;
      }
    }

    // babel-generator did our code generation for us, so remove the old AST
    asset.ast = null;
    asset.outputCode = result.code;
    asset.isAstDirty = false;
  });

  return function(_x) {
    return _ref.apply(this, arguments);
  };
})();