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

var _require = require('babel-core');

const BabelFile = _require.File;

const traverse = require('babel-traverse').default;
const codeFrame = require('babel-code-frame');
const collectDependencies = require('../visitors/dependencies');
const walk = require('babylon-walk');
const Asset = require('../Asset');
const babylon = require('babylon');
const insertGlobals = require('../visitors/globals');
const fsVisitor = require('../visitors/fs');
const babel = require('../transforms/babel');
const generate = require('babel-generator').default;
const uglify = require('../transforms/uglify');
const SourceMap = require('../SourceMap');

const IMPORT_RE = /\b(?:import\b|export\b|require\s*\()/;
const GLOBAL_RE = /\b(?:process|__dirname|__filename|global|Buffer)\b/;
const FS_RE = /\breadFileSync\b/;
const SW_RE = /\bnavigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(/;
const WORKER_RE = /\bnew\s*Worker\s*\(/;

class JSAsset extends Asset {
  constructor(name, pkg, options) {
    super(name, pkg, options);
    this.type = 'js';
    this.globals = new Map();
    this.isAstDirty = false;
    this.isES6Module = false;
    this.outputCode = null;
    this.cacheData.env = {};
    this.sourceMap = options.rendition ? options.rendition.sourceMap : null;
  }

  shouldInvalidate(cacheData) {
    for (let key in cacheData.env) {
      if (cacheData.env[key] !== process.env[key]) {
        return true;
      }
    }

    return false;
  }

  mightHaveDependencies() {
    return (
      this.isAstDirty ||
      !/.js$/.test(this.name) ||
      IMPORT_RE.test(this.contents) ||
      GLOBAL_RE.test(this.contents) ||
      SW_RE.test(this.contents) ||
      WORKER_RE.test(this.contents)
    );
  }

  getParserOptions() {
    var _this = this;

    return _asyncToGenerator(function*() {
      // Babylon options. We enable a few plugins by default.
      const options = {
        filename: _this.name,
        allowReturnOutsideFunction: true,
        allowHashBang: true,
        ecmaVersion: Infinity,
        strictMode: false,
        sourceType: 'module',
        locations: true,
        plugins: ['exportExtensions', 'dynamicImport']
      };

      // Check if there is a babel config file. If so, determine which parser plugins to enable
      _this.babelConfig = yield babel.getConfig(_this);
      if (_this.babelConfig) {
        const file = new BabelFile(_this.babelConfig);
        options.plugins.push(...file.parserOpts.plugins);
      }

      return options;
    })();
  }

  parse(code) {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      const options = yield _this2.getParserOptions();
      return babylon.parse(code, options);
    })();
  }

  traverse(visitor) {
    return traverse(this.ast, visitor, null, this);
  }

  traverseFast(visitor) {
    return walk.simple(this.ast, visitor, this);
  }

  collectDependencies() {
    walk.ancestor(this.ast, collectDependencies, this);
  }

  pretransform() {
    var _this3 = this;

    return _asyncToGenerator(function*() {
      yield babel(_this3);
    })();
  }

  transform() {
    var _this4 = this;

    return _asyncToGenerator(function*() {
      if (_this4.options.target === 'browser') {
        if (_this4.dependencies.has('fs') && FS_RE.test(_this4.contents)) {
          yield _this4.parseIfNeeded();
          _this4.traverse(fsVisitor);
        }

        if (GLOBAL_RE.test(_this4.contents)) {
          yield _this4.parseIfNeeded();
          walk.ancestor(_this4.ast, insertGlobals, _this4);
        }
      }

      if (_this4.isES6Module) {
        yield babel(_this4);
      }

      if (_this4.options.minify) {
        yield uglify(_this4);
      }
    })();
  }

  generate() {
    var _this5 = this;

    return _asyncToGenerator(function*() {
      let code;
      if (_this5.isAstDirty) {
        let opts = {
          sourceMaps: _this5.options.sourceMaps,
          sourceFileName: _this5.relativeName
        };

        let generated = generate(_this5.ast, opts, _this5.contents);

        if (_this5.options.sourceMaps && generated.rawMappings) {
          let rawMap = new SourceMap(generated.rawMappings, {
            [_this5.relativeName]: _this5.contents
          });

          // Check if we already have a source map (e.g. from TypeScript or CoffeeScript)
          // In that case, we need to map the original source map to the babel generated one.
          if (_this5.sourceMap) {
            _this5.sourceMap = yield new SourceMap().extendSourceMap(
              _this5.sourceMap,
              rawMap
            );
          } else {
            _this5.sourceMap = rawMap;
          }
        }

        code = generated.code;
      } else {
        code = _this5.outputCode || _this5.contents;
      }

      if (_this5.options.sourceMaps && !_this5.sourceMap) {
        _this5.sourceMap = new SourceMap().generateEmptyMap(
          _this5.relativeName,
          _this5.contents
        );
      }

      if (_this5.globals.size > 0) {
        code = Array.from(_this5.globals.values()).join('\n') + '\n' + code;
        if (_this5.options.sourceMaps) {
          if (!(_this5.sourceMap instanceof SourceMap)) {
            _this5.sourceMap = yield new SourceMap().addMap(_this5.sourceMap);
          }

          _this5.sourceMap.offset(_this5.globals.size);
        }
      }

      return {
        js: code,
        map: _this5.sourceMap
      };
    })();
  }

  generateErrorMessage(err) {
    const loc = err.loc;
    if (loc) {
      err.codeFrame = codeFrame(this.contents, loc.line, loc.column + 1);
      err.highlightedCodeFrame = codeFrame(
        this.contents,
        loc.line,
        loc.column + 1,
        {highlightCode: true}
      );
    }

    return err;
  }
}

module.exports = JSAsset;