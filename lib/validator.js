import Debug from 'debug';

import { validate as validateCommunityPortal } from './community-portal.js';
import { validate as validateDiscourse } from './discourse.js';
import { validate as validateGithub } from './github.js';
import { validate as validateWiki } from './wiki.js';

const debug = Debug('contributions:validator');

export function validateConfig(config) {
  debug('Validating config..');

  if (!config) {
    throw new Error('No config passed!');
  }

  validateCommunityPortal(config.communityPortal);
  validateDiscourse(config.discourse);
  validateWiki(config.mediaWiki);
  validateGithub(config.github);
}
