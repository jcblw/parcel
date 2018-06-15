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
const urlJoin = require('../utils/urlJoin');
const md5 = require('../utils/md5');

class RawAsset extends Asset {
  // Don't load raw assets. They will be copied by the RawPackager directly.
  load() {}

  generate() {
    // Don't return a URL to the JS bundle if there is a bundle loader defined for this asset type.
    // This will cause the actual asset to be automatically preloaded prior to the JS bundle running.
    if (this.options.bundleLoaders[this.type]) {
      return {};
    }

    const pathToAsset = urlJoin(
      this.options.publicURL,
      this.generateBundleName()
    );

    return {
      js: `module.exports=${JSON.stringify(pathToAsset)};`
    };
  }

  generateHash() {
    var _this = this;

    return _asyncToGenerator(function*() {
      return yield md5.file(_this.name);
    })();
  }
}

module.exports = RawAsset;