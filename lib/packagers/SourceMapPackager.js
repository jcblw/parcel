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

const path = require('path');
const Packager = require('./Packager');
const SourceMap = require('../SourceMap');

class SourceMapPackager extends Packager {
  start() {
    var _this = this;

    return _asyncToGenerator(function*() {
      _this.sourceMap = new SourceMap();
    })();
  }

  addAsset(asset) {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      yield _this2.sourceMap.addMap(
        asset.generated.map,
        _this2.bundle.parentBundle.getOffset(asset)
      );
    })();
  }

  end() {
    var _this3 = this;

    return _asyncToGenerator(function*() {
      let file = path.basename(_this3.bundle.name);
      yield _this3.write(_this3.sourceMap.stringify(file));
      yield Packager.prototype.end.call(_this3);
    })();
  }
}

module.exports = SourceMapPackager;