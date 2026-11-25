import Debug from 'debug';
import { z } from 'zod';

import { communityPortalSchema } from './community-portal.js';
import { discourseSchema } from './discourse.js';
import { githubSchema } from './github.js';
import { mediaWikiSchema } from './wiki.js';
import { bugzillaSchema } from './bugzilla.js';
import { osmSchema } from './osm.js';

const debug = Debug('contributions:validator');

export const configSchema = z.strictObject({
  outputFile: z.string().optional(),
  communityPortal: communityPortalSchema.optional(),
  discourse: discourseSchema.optional(),
  mediaWiki: mediaWikiSchema.optional(),
  github: githubSchema.optional(),
  bugzilla: bugzillaSchema.optional(),
  osm: osmSchema.optional(),
});

type SourceSchemas = {
  communityPortal: typeof communityPortalSchema;
  discourse: typeof discourseSchema;
  mediaWiki: typeof mediaWikiSchema;
  github: typeof githubSchema;
  bugzilla: typeof bugzillaSchema;
  osm: typeof osmSchema;
};

// The config as passed in by the caller. The source schemas first check
// `enabled` on a loose object and then pipe into the actual schema, so their
// inferred input type would accept any keys. Use the input of the actual
// schema instead, so callers get type checking for the source options.
export type ConfigInput = Omit<
  z.input<typeof configSchema>,
  keyof SourceSchemas
> & {
  [K in keyof SourceSchemas]?: z.input<SourceSchemas[K]['out']>;
};
// The validated config, with all defaults applied.
export type Config = z.output<typeof configSchema>;

export function validateConfig(config: unknown): Config {
  debug('Validating config..');
  return configSchema.parse(config);
}
