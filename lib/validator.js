import Debug from 'debug';
import { z } from 'zod';

import { communityPortalSchema } from './community-portal.js';
import { discourseSchema } from './discourse.js';
import { githubSchema } from './github.js';
import { mediaWikiSchema } from './wiki.js';
import { bugzillaSchema } from './bugzilla.js';
import { osmSchema } from './osm.js';

const debug = Debug('contributions:validator');

export const configSchema = z.object({
  outputFile: z.string().optional(),
  communityPortal: communityPortalSchema.optional(),
  discourse: discourseSchema.optional(),
  mediaWiki: mediaWikiSchema.optional(),
  github: githubSchema.optional(),
  bugzilla: bugzillaSchema.optional(),
  osm: osmSchema.optional(),
});

export function validateConfig(config) {
  debug('Validating config..');
  configSchema.parse(config);
}
