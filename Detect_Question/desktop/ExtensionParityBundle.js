'use strict';

// The standalone browser must use the same extraction code as the extension.
// Keeping this list in extension load order prevents the two products from
// silently drifting into incompatible question detection behaviour.
const CONTENT_SCRIPT_FILES = require('./generatedExtensionParityScripts');

function readExtensionParityScripts() {
  return CONTENT_SCRIPT_FILES.map(script => ({
    relativePath: script.relativePath,
    source: Buffer.from(script.base64, 'base64').toString('utf8')
  }));
}

module.exports = { CONTENT_SCRIPT_FILES, readExtensionParityScripts };
