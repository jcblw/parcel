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
const fs = require('../utils/fs');
const localRequire = require('../utils/localRequire');

class ReasonAsset extends Asset {
  constructor(name, pkg, options) {
    super(name, pkg, options);
    this.type = 'js';
  }

  generate() {
    var _this = this;

    return _asyncToGenerator(function*() {
      const bsb = yield localRequire('bsb-js', _this.name);

      // This runs BuckleScript - the Reason to JS compiler.
      // Other Asset types use `localRequire` but the `bsb-js` package already
      // does that internally. This should also take care of error handling in
      // the Reason compilation process.
      if (process.env.NODE_ENV !== 'test') {
        yield bsb.runBuild();
      }

      // This is a simplified use-case for Reason - it only loads the recommended
      // BuckleScript configuration to simplify the file processing.
      const outputFile = _this.name.replace(/\.(re|ml)$/, '.bs.js');
      const outputContent = yield fs.readFile(outputFile);
      return outputContent.toString();
    })();
  }
}

module.exports = ReasonAsset;