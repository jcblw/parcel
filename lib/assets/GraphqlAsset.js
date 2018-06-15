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

class GraphqlAsset extends Asset {
  constructor(name, pkg, options) {
    super(name, pkg, options);
    this.type = 'js';
  }

  parse(code) {
    var _this = this;

    return _asyncToGenerator(function*() {
      let gql = yield localRequire('graphql-tag', _this.name);
      return gql(code);
    })();
  }

  generate() {
    return {
      js: `module.exports=${JSON.stringify(this.ast, false, 2)};`
    };
  }
}

module.exports = GraphqlAsset;