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

require('v8-compile-cache');
const Pipeline = require('./Pipeline');

let pipeline;

exports.init = function(options, callback) {
  pipeline = new Pipeline(options || {});
  Object.assign(process.env, options.env || {});
  process.env.HMR_PORT = options.hmrPort;
  process.env.HMR_HOSTNAME = options.hmrHostname;
  callback();
};

exports.run = (() => {
  var _ref = _asyncToGenerator(function*(
    path,
    pkg,
    options,
    isWarmUp,
    callback
  ) {
    try {
      options.isWarmUp = isWarmUp;
      var result = yield pipeline.process(path, pkg, options);

      callback(null, result);
    } catch (err) {
      let returned = err;
      returned.fileName = path;
      callback(returned);
    }
  });

  return function(_x, _x2, _x3, _x4, _x5) {
    return _ref.apply(this, arguments);
  };
})();

process.on('unhandledRejection', function(err) {
  // ERR_IPC_CHANNEL_CLOSED happens when the worker is killed before it finishes processing
  if (err.code !== 'ERR_IPC_CHANNEL_CLOSED') {
    console.error('Unhandled promise rejection:', err.stack);
  }
});