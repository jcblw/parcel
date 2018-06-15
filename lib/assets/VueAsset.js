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
const md5 = require('../utils/md5');

var _require = require('uglify-es');

const minify = _require.minify;

class VueAsset extends Asset {
  constructor(name, pkg, options) {
    super(name, pkg, options);
    this.type = 'js';
  }

  parse(code) {
    var _this = this;

    return _asyncToGenerator(function*() {
      // Is being used in component-compiler-utils, errors if not installed...
      _this.vueTemplateCompiler = yield localRequire(
        'vue-template-compiler',
        _this.name
      );
      _this.vue = yield localRequire(
        '@vue/component-compiler-utils',
        _this.name
      );

      return _this.vue.parse({
        source: code,
        needMap: _this.options.sourceMaps,
        filename: _this.relativeName, // Used for sourcemaps
        sourceRoot: '' // Used for sourcemaps. Override so it doesn't use cwd
      });
    })();
  }

  generate() {
    var _this2 = this;

    return _asyncToGenerator(function*() {
      let descriptor = _this2.ast;
      let parts = [];

      if (descriptor.script) {
        parts.push({
          type: descriptor.script.lang || 'js',
          value: descriptor.script.content,
          sourceMap: descriptor.script.map
        });
      }

      if (descriptor.template) {
        parts.push({
          type: descriptor.template.lang || 'html',
          value: descriptor.template.content.trim()
        });
      }

      if (descriptor.styles) {
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (
            var _iterator = descriptor.styles[Symbol.iterator](), _step;
            !(_iteratorNormalCompletion = (_step = _iterator.next()).done);
            _iteratorNormalCompletion = true
          ) {
            let style = _step.value;

            parts.push({
              type: style.lang || 'css',
              value: style.content.trim(),
              modules: !!style.module
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

      return parts;
    })();
  }

  postProcess(generated) {
    var _this3 = this;

    return _asyncToGenerator(function*() {
      let result = [];

      let hasScoped = _this3.ast.styles.some(function(s) {
        return s.scoped;
      });
      let id = md5(_this3.name).slice(-6);
      let scopeId = hasScoped ? `data-v-${id}` : null;
      let optsVar = '$' + id;

      // Generate JS output.
      let js = _this3.ast.script ? generated[0].value : '';
      let supplemental = `
      var ${optsVar} = exports.default || module.exports;
      if (typeof ${optsVar} === 'function') {
        ${optsVar} = ${optsVar}.options;
      }
    `;

      supplemental += _this3.compileTemplate(generated, scopeId, optsVar);
      supplemental += _this3.compileCSSModules(generated, optsVar);
      supplemental += _this3.compileHMR(generated, optsVar);

      if (_this3.options.minify && supplemental) {
        var _minify = minify(supplemental, {toplevel: true});

        let code = _minify.code,
          error = _minify.error;

        if (error) {
          throw error;
        }

        supplemental = code;
      }

      js += supplemental;

      if (js) {
        result.push({
          type: 'js',
          value: js
        });
      }

      let map = generated.find(function(r) {
        return r.type === 'map';
      });
      if (map) {
        result.push(map);
      }

      let css = _this3.compileStyle(generated, scopeId);
      if (css) {
        result.push({
          type: 'css',
          value: css
        });
      }

      return result;
    })();
  }

  compileTemplate(generated, scopeId, optsVar) {
    let html = generated.find(r => r.type === 'html');
    if (html) {
      let isFunctional = this.ast.template.attrs.functional;
      let template = this.vue.compileTemplate({
        source: html.value,
        filename: this.relativeName,
        compiler: this.vueTemplateCompiler,
        isProduction: this.options.production,
        isFunctional,
        compilerOptions: {
          scopeId
        }
      });

      if (Array.isArray(template.errors) && template.errors.length >= 1) {
        throw new Error(template.errors[0]);
      }

      return `
        /* template */
        Object.assign(${optsVar}, (function () {
          ${template.code}
          return {
            render: render,
            staticRenderFns: staticRenderFns,
            _compiled: true,
            _scopeId: ${JSON.stringify(scopeId)},
            functional: ${JSON.stringify(isFunctional)}
          };
        })());
      `;
    }

    return '';
  }

  compileCSSModules(generated, optsVar) {
    let cssRenditions = generated.filter(r => r.type === 'css');
    let cssModulesCode = '';
    this.ast.styles.forEach((style, index) => {
      if (style.module) {
        let cssModules = JSON.stringify(cssRenditions[index].cssModules);
        let name = style.module === true ? '$style' : style.module;
        cssModulesCode += `\nthis[${JSON.stringify(name)}] = ${cssModules};`;
      }
    });

    if (cssModulesCode) {
      cssModulesCode = `function hook(){${cssModulesCode}\n}`;

      let isFunctional =
        this.ast.template && this.ast.template.attrs.functional;
      if (isFunctional) {
        return `
          /* css modules */
          (function () {
            ${cssModulesCode}
            ${optsVar}._injectStyles = hook;
            var originalRender = ${optsVar}.render;
            ${optsVar}.render = function (h, context) {
              hook.call(context);
              return originalRender(h, context);
            };
          })();
        `;
      } else {
        return `
          /* css modules */
          (function () {
            ${cssModulesCode}
            ${optsVar}.beforeCreate = ${optsVar}.beforeCreate ? ${optsVar}.beforeCreate.concat(hook) : [hook];
          })();
        `;
      }
    }

    return '';
  }

  compileStyle(generated, scopeId) {
    return generated.filter(r => r.type === 'css').reduce((p, r, i) => {
      let css = r.value;
      let scoped = this.ast.styles[i].scoped;

      // Process scoped styles if needed.
      if (scoped) {
        var _vue$compileStyle = this.vue.compileStyle({
          source: css,
          filename: this.relativeName,
          id: scopeId,
          scoped
        });

        let code = _vue$compileStyle.code,
          errors = _vue$compileStyle.errors;

        if (errors.length) {
          throw errors[0];
        }

        css = code;
      }

      return p + css;
    }, '');
  }

  compileHMR(generated, optsVar) {
    if (!this.options.hmr) {
      return '';
    }

    this.addDependency('vue-hot-reload-api');
    this.addDependency('vue');

    let cssHMR = '';
    if (this.ast.styles.length) {
      cssHMR = `
        var reloadCSS = require('_css_loader');
        module.hot.dispose(reloadCSS);
        module.hot.accept(reloadCSS);
      `;
    }

    let isFunctional = this.ast.template && this.ast.template.attrs.functional;

    return `
    /* hot reload */
    (function () {
      if (module.hot) {
        var api = require('vue-hot-reload-api');
        api.install(require('vue'));
        if (api.compatible) {
          module.hot.accept();
          if (!module.hot.data) {
            api.createRecord('${optsVar}', ${optsVar});
          } else {
            api.${
              isFunctional ? 'rerender' : 'reload'
            }('${optsVar}', ${optsVar});
          }
        }

        ${cssHMR}
      }
    })();`;
  }
}

module.exports = VueAsset;