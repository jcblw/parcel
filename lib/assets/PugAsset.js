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
const Asset = require('../Asset');
const localRequire = require('../utils/localRequire');

class PugAsset extends Asset {
  constructor(name, pkg, options) {
    super(name, pkg, options);
    this.type = 'html';
  }

  generate() {
    var _this = this;

    return _asyncToGenerator(function*() {
      const pug = yield localRequire('pug', _this.name);
      const config =
        (yield _this.getConfig(['.pugrc', '.pugrc.js', 'pug.config.js'])) || {};

      const compiled = pug.compile(_this.contents, {
        compileDebug: false,
        filename: _this.name,
        basedir: path.dirname(_this.name),
        pretty: !_this.options.minify,
        templateName: path.basename(
          _this.basename,
          path.extname(_this.basename)
        ),
        filters: config.filters,
        filterOptions: config.filterOptions,
        filterAliases: config.filterAliases
      });

      if (compiled.dependencies) {
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (
            var _iterator = compiled.dependencies[Symbol.iterator](), _step;
            !(_iteratorNormalCompletion = (_step = _iterator.next()).done);
            _iteratorNormalCompletion = true
          ) {
            let item = _step.value;

            _this.addDependency(item, {
              includedInParent: true
            });
          }
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
      }

      return compiled();
    })();
  }
}

module.exports = PugAsset;