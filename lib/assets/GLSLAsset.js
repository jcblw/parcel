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
const path = require('path');
const promisify = require('../utils/promisify');
const Resolver = require('../Resolver');

class GLSLAsset extends Asset {
  constructor(name, pkg, options) {
    super(name, pkg, options);
    this.type = 'js';
  }

  parse() {
    var _this = this;

    return _asyncToGenerator(function*() {
      const glslifyDeps = yield localRequire('glslify-deps', _this.name);

      // Use the Parcel resolver rather than the default glslify one.
      // This adds support for parcel features like alises, and tilde paths.
      const resolver = new Resolver({
        extensions: ['.glsl', '.vert', '.frag'],
        rootDir: _this.options.rootDir
      });

      // Parse and collect dependencies with glslify-deps
      let cwd = path.dirname(_this.name);
      let depper = glslifyDeps({
        cwd,
        resolve: (() => {
          var _ref = _asyncToGenerator(function*(target, opts, next) {
            try {
              let res = yield resolver.resolve(
                target,
                path.join(opts.basedir, 'index')
              );
              next(null, res.path);
            } catch (err) {
              next(err);
            }
          });

          return function resolve(_x, _x2, _x3) {
            return _ref.apply(this, arguments);
          };
        })()
      });

      return yield promisify(depper.inline.bind(depper))(_this.contents, cwd);
    })();
  }

  collectDependencies() {
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (
        var _iterator = this.ast[Symbol.iterator](), _step;
        !(_iteratorNormalCompletion = (_step = _iterator.next()).done);
        _iteratorNormalCompletion = true
      ) {
        let dep = _step.value;

        if (!dep.entry) {
          this.addDependency(dep.file, {includedInParent: true});
        }
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

  generate() {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      // Generate the bundled glsl file
      const glslifyBundle = yield localRequire('glslify-bundle', _this2.name);
      let glsl = glslifyBundle(_this2.ast);

      return {
        js: `module.exports=${JSON.stringify(glsl)};`
      };
    })();
  }
}

module.exports = GLSLAsset;