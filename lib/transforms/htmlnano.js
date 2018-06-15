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

const posthtml = require('posthtml');
const htmlnano = require('htmlnano');

module.exports = (() => {
  var _ref = _asyncToGenerator(function*(asset) {
    yield asset.parseIfNeeded();

    const htmlNanoConfig = asset.package.htmlnano ||
      (yield asset.getConfig(['.htmlnanorc', '.htmlnanorc.js'])) || {
        collapseWhitespace: 'conservative',
        minifyCss: {
          safe: true
        }
      };

    let res = yield posthtml([htmlnano(htmlNanoConfig)]).process(asset.ast, {
      skipParse: true
    });

    asset.ast = res.tree;
    asset.isAstDirty = true;
  });

  return function(_x) {
    return _ref.apply(this, arguments);
  };
})();