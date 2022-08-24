# volunteer-contributions-fetch

This library fetches contributions from several different sources and saves them in a JSON file. This can be used to track your own volunteer contributions. An example of this can be found on [Michael's website](https://mkohler.dev/contributions/).

## Sources

### Supported Sources

Currently the following sources are supported. Feel free to contribute a PR if you'd like to support another source!

* GitHub
  * Issues
  * PRs
  * PR Reviews
* MediaWiki
  * Page edited
* Discourse
  * Topic created
  * Post created
* Mozilla Community Portal
  * Participated in event
  * Participated in campaign

Each of the sources can be enabled separately. See the configuration section below.

### Planned Sources

The following sources are planned:

* GitHub
  * Comments
* Bugzilla
  * Bug reported
  * Bug commented on
* Phabricator
  * Revision created
  * Revision updated

### Possible future sources

The following sources would be interesting for (at least) Mozilla contributors:

* support.mozilla.org
* Pontoon

## Usage

First install the package from npm:

```bash
npm install volunteer-contribution-fetch
```

Then you can create a file in your project which runs the fetch operation and provides the necesary config:

```js
const { fetchAll } = require('volunteer-contributions-fetch');

const config = {}; // See below for documentation and a sample config

fetchAll(config);
```

## Configuration

You can configure the different providers with a config you pass into the `fetchAll` function call. These config parameters are outlined below. The config gets validated and you might get an error if you haven't specified all necessary properties.

Additionally to the configuration file, we also require some environment variables to be set:

* `GITHUB_TOKEN` with a GitHub token, if the GitHub source is enabled

While these tokens could potentially also be included the config, we want to make it hard to mistakenly publish secrets within code.

### Configuration documentation

This section documents all the possible configuration values. For examples see the sample configuration below.

#### General

| Field             | Data Type | Required | Default | Description                                        |
|-------------------|-----------|----------|---------|----------------------------------------------------|
| `outputFile`      | string    | Yes      | -       | Path to contributions output file                  |
| `communityPortal` | Object    | No       | -       | Community Portal configuration options (see below) |
| `discourse`       | Object    | No       | -       | Discourse configuration options (see below)        |
| `github`          | Object    | No       | -       | GitHub configuration options (see below)           |
| `mediaWiki`       | Object    | No       | -       | MediaWiki configuration options (see below)        |

#### Community Portal

| Field               | Data Type | Required | Default | Description                                                                                                                |
|---------------------|-----------|----------|---------|----------------------------------------------------------------------------------------------------------------------------|
| `enabled`           | boolean   | Yes      | -       | Indicates whether this data source is enabled. Alternatively you can also leave off the `communityPortal` object entirely. |
| `baseUrl`           | string    | Yes      | -       | Community Portal base url without trailing slash                                                                           |
| `username`          | string    | Yes      | -       | Username on the Community Portal                                                                                           |
| `participationType` | string    | Yes      | -       | Label for entries related to having participated in an event.                                                              |
| `campaignType`      | string    | Yes      | -       | Label for entries related to having participated in a campaign                                                             |

#### Discourse

| Field               | Data Type | Required | Default | Description                                                                                                                |
|---------------------|-----------|----------|---------|----------------------------------------------------------------------------------------------------------------------------|
| `enabled`           | boolean   | Yes      | -       | Indicates whether this data source is enabled. Alternatively you can also leave off the `discourse` object entirely.       |
| `baseUrl`           | string    | Yes      | -       | API base url without trailing slash                                                                                        |
| `username`          | string    | Yes      | -       | Username on Discoruse                                                                                                      |
| `topicType`         | string    | Yes      | -       | Label for entries related to having created a new topic.                                                                   |
| `postType`          | string    | Yes      | -       | Label for entries related to having posted on an existing topic.                                                           |

#### GitHub

| Field                      | Data Type | Required | Default | Description                                                                                                                |
|----------------------------|-----------|----------|---------|----------------------------------------------------------------------------------------------------------------------------|
| `enabled`                  | boolean   | Yes      | -       | Indicates whether this data source is enabled. Alternatively you can also leave off the `github` object entirely.          |
| `username`                 | string    | Yes      | -       | Username on GitHub                                                                                                         |
| `stopDate`                 | string    | Yes      | -       | `new Date()` parseable string containing a date of possibly earliest contribution to track                                 |
| `filter`                   | string    | Yes      | -       | Regex to apply to each entry to filter for organization/repo names. For example: `"mozilla|firefox"` to only include orgs and repos with either "mozilla" or "firefox" it their name.|
| `types`                    | Object    | Yes      | -       | Object containing the different labels below                                                                               |
| `types.commit`             | string    | Yes      | -       | Label for entries related to GitHub commits                                                                                |
| `types.privateCommit`      | string    | Yes      | -       | Label for entries related to private GitHub commits                                                                        |
| `types.createdPR`          | string    | Yes      | -       | Label for entries related to opening GitHub PRs                                                                            |
| `types.createdIssue`       | string    | Yes      | -       | Label for entries related to creating GitHub issues                                                                        |
| `types.commentedPR`        | string    | Yes      | -       | Label for entries related to commenting on a GitHub PR (review)                                                            |
| `types.approvedPR`         | string    | Yes      | -       | Label for entries related to approving a GitHub PR                                                                         |
| `types.changesRequestedPR` | string    | Yes      | -       | Label for entries related to requesting changes on a GitHub PR                                                             |
| `types.reviewedPR`         | string    | Yes      | -       | Label for entries related to reviewing a GitHub PR (fallback)                                                              |

### Sample configuration

```js
const config = {
  outputFile: `${__dirname}/_data/contributions.json`,
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
    }
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
