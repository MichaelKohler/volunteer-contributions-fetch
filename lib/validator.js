const debug = require('debug')('contributions:validator');
const { validate: validateCommunityPortal } = require('./community-portal');
const { validate: validateDiscourse } = require('./discourse');
const { validate: validateGithub } = require('./github');
const { validate: validateWiki } = require('./wiki');

module.exports = {
  validateConfig,
};

function validateConfig(config) {
  debug('Validating config..');

  if (!config) {
    throw new Error('No config passed!');
  }

  if (!config.outputFile) {
    throw new Error('outputFile is required');
  }

  validateCommunityPortal(config.communityPortal);
  validateDiscourse(config.discourse);
  validateWiki(config.mediaWiki);
  validateGithub(config.github);
}
