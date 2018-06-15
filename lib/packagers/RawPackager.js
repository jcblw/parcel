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

const Packager = require('./Packager');
const fs = require('../utils/fs');

class RawPackager extends Packager {
  // Override so we don't create a file for this bundle.
  // Each asset will be emitted as a separate file instead.
  setup() {}

  addAsset(asset) {
    var _this = this;

    return _asyncToGenerator(function*() {
      let contents = asset.generated[asset.type];
      if (!contents || (contents && contents.path)) {
        contents = yield fs.readFile(contents ? contents.path : asset.name);
      }

      _this.size = contents.length;
      yield fs.writeFile(_this.bundle.name, contents);
    })();
  }

  getSize() {
    return this.size || 0;
  }

  end() {}
}

module.exports = RawPackager;