# volunteer-contributions-fetch

This library fetches contributions from several different sources and saves them in a JSON file. This can be used to track your own volunteer contributions. An example of this can be found on [Michael's website](https://mkohler.dev/contributions/).

## Sources

### Supported Sources

Currently the following sources are supported. Feel free to contribute a PR if you'd like to support another source!

- GitHub
  - Issues created
  - Comments on issues
  - PRs
  - PR Reviews
- Bugzilla
  - Bug reported
  - Bug commented on
- MediaWiki
  - Page edited
- Discourse
  - Topic created
  - Post created
- Mozilla Community Portal
  - Participated in event
  - Participated in campaign

Each of the sources can be enabled separately. See the configuration section below.

### Planned Sources

The following sources are planned:

- Phabricator
  - Revision created
  - Revision updated

### Possible future sources

The following sources would be interesting for (at least) Mozilla contributors, however they do not expose an activity API endpoint to easily gather information for a certain user.

- support.mozilla.org
- Pontoon

## Usage

First install the package from npm:

```bash
npm install volunteer-contribution-fetch
```

Then you can create a file in your project which runs the fetch operation and provides the necessary config:

```js
const { fetchAll } = require('volunteer-contributions-fetch');

const config = {}; // See below for documentation and a sample config

fetchAll(config);
```

### Usage without output file

This can also be used without having to rely on an `outputFile`. For this case the `fetchAll` function returns all contributions. Additionally you can also pass existing contributions to the function and these will be considered as well. The return value and the parameter of the function works the same as having an `outputFile`.

```js
const { fetchAll } = require('volunteer-contributions-fetch');

const config = {}; // See below for documentation and a sample config
const existingContributions = [{ ... }];

const results = fetchAll(config, existingContributions);
// results is now all existing contributions plus any newly fetched contribution
```

Note that passing existing contributions this way will be ignored if a `outputFile` is used.

## Configuration

You can configure the different providers with a config you pass into the `fetchAll` function call. These config parameters are outlined below. The config gets validated and you might get an error if you haven't specified all necessary properties.

Additionally to the configuration file, we also require some environment variables to be set:

- `GITHUB_TOKEN` with a GitHub token, if the GitHub source is enabled

While these tokens could potentially also be included the config, we want to make it hard to mistakenly publish secrets within code.

### Configuration documentation

This section documents all the possible configuration values. For examples see the sample configuration below.

#### General

| Field             | Data Type | Required | Default | Description                                                                                                        |
| ----------------- | --------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `outputFile`      | string    | No       | -       | Path to contributions output file. Contributions are read from this file and new contributions will be added here. |
| `bugzilla`        | Object    | No       | -       | Bugzilla configuration options (see below)                                                                         |
| `communityPortal` | Object    | No       | -       | Community Portal configuration options (see below)                                                                 |
| `discourse`       | Object    | No       | -       | Discourse configuration options (see below)                                                                        |
| `github`          | Object    | No       | -       | GitHub configuration options (see below)                                                                           |
| `mediaWiki`       | Object    | No       | -       | MediaWiki configuration options (see below)                                                                        |

#### Bugzilla

| Field                 | Data Type | Required | Default                   | Description                                                                                                          |
| --------------------- | --------- | -------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `enabled`             | boolean   | Yes      | -                         | Indicates whether this data source is enabled. Alternatively you can also leave off the `mediaWiki` object entirely. |
| `baseUrl`             | string    | Yes      | -                         | API base url without trailing slash (for example: `https://bugzilla.mozilla.org`)                                    |
| `username`            | string    | Yes      | -                         | Username on MediaWiki                                                                                                |
| `stopDate`            | string    | Yes      | -                         | `new Date()` parseable string containing a date of possibly earliest contribution to track                           |
| `types`               | Object    | No       | -                         | Object containing the different labels below                                                                         |
| `types.createdType`   | string    | No       | Created a Bug Report      | Label for entries related to having report a bug/enhancement.                                                        |
| `types.commentedType` | string    | No       | Commented on a Bug Report | Label for entries related to having commented on a bug/enhancement.                                                  |

#### Community Portal

| Field               | Data Type | Required | Default                    | Description                                                                                                                |
| ------------------- | --------- | -------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `enabled`           | boolean   | Yes      | -                          | Indicates whether this data source is enabled. Alternatively you can also leave off the `communityPortal` object entirely. |
| `baseUrl`           | string    | Yes      | -                          | Community Portal base url without trailing slash                                                                           |
| `username`          | string    | Yes      | -                          | Username on the Community Portal                                                                                           |
| `participationType` | string    | No       | Participated in an event   | Label for entries related to having participated in an event.                                                              |
| `campaignType`      | string    | No       | Participated in a campaign | Label for entries related to having participated in a campaign                                                             |

#### Discourse

| Field             | Data Type | Required | Default                   | Description                                                                                                                     |
| ----------------- | --------- | -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`         | boolean   | Yes      | -                         | Indicates whether this data source is enabled. Alternatively you can also leave off the `discourse` object entirely.            |
| `baseUrl`         | string    | Yes      | -                         | API base url without trailing slash                                                                                             |
| `username`        | string    | Yes      | -                         | Username on Discourse                                                                                                           |
| `topicType`       | string    | No       | Created Discourse Topic   | Label for entries related to having created a new topic.                                                                        |
| `postType`        | string    | No       | Posted on Discourse Topic | Label for entries related to having posted on an existing topic.                                                                |
| `keepDeletedPost` | boolean   | No       | false                     | If a post gets deleted and can't be queried anymore, setting this to `true` will not delete it from the previous contributions. |

#### GitHub

| Field                      | Data Type | Required | Default                             | Description                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | --------- | -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                  | boolean   | Yes      | -                                   | Indicates whether this data source is enabled. Alternatively you can also leave off the `github` object entirely.                                                                                                                                                                                                                               |
| `allowPrivate`             | boolean   | No       | false                               | Will throw if you pass a `GITHUB_TOKEN` with possible private repo scope. In most cases you will not want to have a token with private scope. Please think twice before enabling this config. When using fine-grained tokens, you need to set this to `true` manually as we can't detect the scopes. In that case, we can't guarantee anything! |
| `commentsEnabled`          | boolean   | No       | true                                | Indicates whether fetching comments is enabled.                                                                                                                                                                                                                                                                                                 |
| `commitsEnabled`           | boolean   | No       | true                                | Indicates whether fetching commits is enabled.                                                                                                                                                                                                                                                                                                  |
| `issuesEnabled`            | boolean   | No       | true                                | Indicates whether fetching issues is enabled.                                                                                                                                                                                                                                                                                                   |
| `reviewsEnabled`           | boolean   | No       | true                                | Indicates whether fetching reviews is enabled.                                                                                                                                                                                                                                                                                                  |
| `username`                 | string    | Yes      | -                                   | Username on GitHub                                                                                                                                                                                                                                                                                                                              |
| `stopDate`                 | string    | Yes      | -                                   | `new Date()` parseable string containing a date of possibly earliest contribution to track                                                                                                                                                                                                                                                      |
| `filter`                   | string    | Yes      | -                                   | Regex to apply to each entry to filter for organization/repo names. For example: `^mozilla` to only include orgs and repos that start with "mozilla".                                                                                                                                                                                           |
| `types`                    | Object    | No       | -                                   | Object containing the different labels below                                                                                                                                                                                                                                                                                                    |
| `types.commit`             | string    | No       | GitHub Commit                       | Label for entries related to GitHub commits                                                                                                                                                                                                                                                                                                     |
| `types.privateCommit`      | string    | No       | Commit in private repository        | Label for entries related to private GitHub commits                                                                                                                                                                                                                                                                                             |
| `types.createdPR`          | string    | No       | Created PR                          | Label for entries related to opening GitHub PRs                                                                                                                                                                                                                                                                                                 |
| `types.createdIssue`       | string    | No       | Created Issue Report                | Label for entries related to creating GitHub issues                                                                                                                                                                                                                                                                                             |
| `types.commented`          | string    | No       | Commented on an Issue               | Label for entries related to commenting on an issue                                                                                                                                                                                                                                                                                             |
| `types.commentedPR`        | string    | No       | Commented on a Pull Request         | Label for entries related to commenting on a GitHub PR (review)                                                                                                                                                                                                                                                                                 |
| `types.approvedPR`         | string    | No       | Approved a Pull Request             | Label for entries related to approving a GitHub PR                                                                                                                                                                                                                                                                                              |
| `types.changesRequestedPR` | string    | No       | Requested changes on a Pull Request | Label for entries related to requesting changes on a GitHub PR                                                                                                                                                                                                                                                                                  |
| `types.reviewedPR`         | string    | No       | Reviewed a Pull Request             | Label for entries related to reviewing a GitHub PR (fallback)                                                                                                                                                                                                                                                                                   |
| `delayMsPerRequest`        | number    | No       | 2000                                | Delay between each request to GitHub. You might hit rate limiting if you set this lower than default.                                                                                                                                                                                                                                           |

#### MediaWiki

| Field      | Data Type | Required | Default   | Description                                                                                                          |
| ---------- | --------- | -------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| `enabled`  | boolean   | Yes      | -         | Indicates whether this data source is enabled. Alternatively you can also leave off the `mediaWiki` object entirely. |
| `baseUrl`  | string    | Yes      | -         | API base url without trailing slash                                                                                  |
| `username` | string    | Yes      | -         | Username on MediaWiki                                                                                                |
| `editType` | string    | No       | Wiki Edit | Label for entries related to having edited an article.                                                               |
| `stopDate` | string    | Yes      | -         | `new Date()` parseable string containing a date of possibly earliest contribution to track                           |

### Sample configuration

```js
const config = {
  outputFile: `${__dirname}/_data/contributions.json`,
  bugzilla: {
    enabled: true,
    baseUrl: 'https://bugzilla.mozilla.org',
    username: 'me@michaelkohler.info',
    stopDate: '2008-01-01',
  },
  communityPortal: {
    enabled: true,
    baseUrl: 'https://community.mozilla.org/people',
    username: 'mkohler',
    participationType: 'Participated in an event',
    campaignType: 'Participated in a campaign',
  },
  discourse: {
    enabled: true,
    baseUrl: 'https://discourse.mozilla.org',
    username: 'mkohler',
    topicType: 'Created Discourse Topic',
    postType: 'Posted on Discourse Topic',
    keepDeletedPost: true,
  },
  mediaWiki: {
    enabled: true,
    baseUrl: 'https://wiki.mozilla.org/api.php?action=feedcontributions',
    username: 'michaelkohler',
    editType: 'Wiki Edit',
    stopDate: '2012-05-01',
  },
  github: {
    enabled: true,
    username: 'MichaelKohler',
    stopDate: '2008-01-01',
    filter: 'mozilla|common-voice|reps',
    types: {
      commit: 'GitHub Commit',
      privateCommit: 'Commit in private repository',
      createdPR: 'Created PR',
      createdIssue: 'Created Issue Report',
      commentedPR: 'Commented on a Pull Request',
      approvedPR: 'Approved a Pull Request',
      changesRequestedPR: 'Requested changes on a Pull Request',
      reviewedPR: 'Reviewed a Pull Request',
    },
  },
};
```

## Developing

Any issues or PRs are welcome! Before doing major changes, please create an issue elaborating on the approach.

### Setup

```bash
npm ci
```

### Tests

```bash
npm run eslint
npm test
```

### Testing changes

You can also add a temporary file with a test config as well as the call to `fetchAll` if you would like to test changes within this project. A sample config can be found in the configuration section above. Please make sure to not include that config file when committing!

### Deployments

Please use [Angular Commit Message Conventions](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#-commit-message-format) when contributing to this project, as depending on the commit message the GitHub Action will directly publish a new version of the package.
