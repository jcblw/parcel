'use strict';

var _require = require('uglify-es');

const minify = _require.minify;

var _require2 = require('serialize-to-js');

const serialize = _require2.serialize;

function serializeObject(obj, shouldMinify = false) {
  let code = `module.exports = ${serialize(obj)};`;

  if (shouldMinify) {
    let minified = minify(code);
    if (minified.error) {
      throw minified.error;
    }

    code = minified.code;
  }

  return code;
}

module.exports = serializeObject;