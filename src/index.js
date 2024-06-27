import readPkg from 'read-pkg';
import { compose } from 'ramda';
import { wrapStep } from 'semantic-release-plugin-decorators';
import { withBothPackageOnlyAndDependentCommits } from './only-package-commits.js';
import versionToGitTag from './version-to-git-tag.js';
import logPluginVersion from './log-plugin-version.js';
import {
  mapNextReleaseVersion,
  withOptionsTransforms,
} from './options-transforms.js';

const analyzeCommits = wrapStep(
  'analyzeCommits',
  compose(logPluginVersion('analyzeCommits'), withBothPackageOnlyAndDependentCommits),
  {
    wrapperName: 'semantic-release-monorepo',
  }
);

const generateNotes = wrapStep(
  'generateNotes',
  compose(
    logPluginVersion('generateNotes'),
    withBothPackageOnlyAndDependentCommits,
    withOptionsTransforms([mapNextReleaseVersion(versionToGitTag)])
  ),
  {
    wrapperName: 'semantic-release-monorepo',
  }
);

const success = wrapStep(
  'success',
  compose(
    logPluginVersion('success'),
    withBothPackageOnlyAndDependentCommits,
    withOptionsTransforms([mapNextReleaseVersion(versionToGitTag)])
  ),
  {
    wrapperName: 'semantic-release-monorepo',
  }
);

const fail = wrapStep(
  'fail',
  compose(
    logPluginVersion('fail'),
    withBothPackageOnlyAndDependentCommits,
    withOptionsTransforms([mapNextReleaseVersion(versionToGitTag)])
  ),
  {
    wrapperName: 'semantic-release-monorepo',
  }
);

const tagFormat = `${readPkg.sync().name}-v\${version}`;

export { analyzeCommits, generateNotes, success, fail, tagFormat };
