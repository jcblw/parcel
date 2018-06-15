'use strict';

let serve = (() => {
  var _ref = _asyncToGenerator(function*(bundler, port, useHTTPS = false) {
    let handler = middleware(bundler);
    let server;
    if (!useHTTPS) {
      server = http.createServer(handler);
    } else if (typeof useHTTPS === 'boolean') {
      server = https.createServer(
        generateCertificate(bundler.options),
        handler
      );
    } else {
      server = https.createServer(yield getCertificate(useHTTPS), handler);
    }

    let freePort = yield getPort({port});
    server.listen(freePort);

    return new Promise(function(resolve, reject) {
      server.on('error', function(err) {
        logger.error(new Error(serverErrors(err, server.address().port)));
        reject(err);
      });

      server.once('listening', function() {
        let addon =
          server.address().port !== port
            ? `- ${logger.chalk.yellow(
                `configured port ${port} could not be used.`
              )}`
            : '';

        logger.persistent(
          `Server running at ${logger.chalk.cyan(
            `${useHTTPS ? 'https' : 'http'}://localhost:${
              server.address().port
            }`
          )} ${addon}`
        );

        resolve(server);
      });
    });
  });

  return function serve(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

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

const http = require('http');
const https = require('https');
const serveStatic = require('serve-static');
const getPort = require('get-port');
const serverErrors = require('./utils/customErrors').serverErrors;
const generateCertificate = require('./utils/generateCertificate');
const getCertificate = require('./utils/getCertificate');
const logger = require('./Logger');
const path = require('path');

serveStatic.mime.define({
  'application/wasm': ['wasm']
});

function setHeaders(res) {
  enableCors(res);
}

function enableCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, HEAD, PUT, PATCH, POST, DELETE'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Content-Type'
  );
}

function middleware(bundler) {
  const serve = serveStatic(bundler.options.outDir, {
    index: false,
    setHeaders: setHeaders
  });

  return function(req, res, next) {
    // Wait for the bundler to finish bundling if needed
    if (bundler.pending) {
      bundler.once('bundled', respond);
    } else {
      respond();
    }

    function respond() {
      if (bundler.errored) {
        return send500();
      } else if (
        !req.url.startsWith(bundler.options.publicURL) ||
        path.extname(req.url) === ''
      ) {
        // If the URL doesn't start with the public path, or the URL doesn't
        // have a file extension, send the main HTML bundle.
        return sendIndex();
      } else {
        // Otherwise, serve the file from the dist folder
        req.url = req.url.slice(bundler.options.publicURL.length);
        return serve(req, res, send404);
      }
    }

    function sendIndex() {
      // If the main asset is an HTML file, serve it
      if (bundler.mainBundle.type === 'html') {
        req.url = `/${path.basename(bundler.mainBundle.name)}`;
        serve(req, res, send404);
      } else {
        send404();
      }
    }

    function send500() {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.writeHead(500);
      res.end('🚨 Build error, check the console for details.');
    }

    function send404() {
      if (next) {
        return next();
      }

      res.writeHead(404);
      res.end();
    }
  };
}

exports.middleware = middleware;
exports.serve = serve;