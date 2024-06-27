import {identity, memoizeWith, pipeP} from 'ramda';
import pkgUp from 'pkg-up';
import readPkg from 'read-pkg';
import path from 'path';
import pLimit from 'p-limit';
import createDebug from 'debug';
import {getCommitFiles, getRoot} from './git-utils.js';
import {mapCommits} from './options-transforms.js';
import {globby} from "globby";

const debug = createDebug('semantic-release:monorepo');
const memoizedGetCommitFiles = memoizeWith(identity, getCommitFiles);

/**
 * Get the normalized PACKAGE root path, relative to the git PROJECT root.
 */
const getPackagePath = async () => {
  const packagePath = await pkgUp();
  const gitRoot = await getRoot();

  return path.relative(gitRoot, path.resolve(packagePath, '..'));
};

const withFiles = async commits => {
  const limit = pLimit(Number(process.env.SRM_MAX_THREADS) || 500);
  return Promise.all(
    commits.map(commit =>
      limit(async () => {
        const files = await memoizedGetCommitFiles(commit.hash);
        return {...commit, files};
      })
    )
  );
};

const filterAsync = async (arr, predicate) => {
  const fail = Symbol()
  return (await Promise.all(arr.map(async item => (await predicate(item)) ? item : fail))).filter(i => i !== fail)
}

const onlyPackageCommits = async commits => {
  const packagePath = await getPackagePath();
  debug('Filter commits by package path: "%s"', packagePath);
  const commitsWithFiles = await withFiles(commits);
  // Convert package root path into segments - one for each folder
  const packageSegments = packagePath.split(path.sep);

  return commitsWithFiles.filter(({files, subject}) => {
    // Normalise paths and check if any changed files' path segments start
    // with that of the package root.
    const packageFile = files.find(file => {
      const fileSegments = path.normalize(file).split(path.sep);
      // Check the file is a *direct* descendent of the package folder (or the folder itself)
      return packageSegments.every((packageSegment, i) => packageSegment === fileSegments[i]);
    });

    if (packageFile) {
      debug(
        'Including commit "%s" because it modified package file "%s".',
        subject,
        packageFile
      );
    }

    return !!packageFile;
  });
};

const onlyDependentCommits = async commits => {
  const packagePath = await getPackagePath();
  const gitRoot = await getRoot();
  const cwd = path.normalize(gitRoot + '/' + packagePath)
  let packageJson;

  try {
    packageJson = require(await pkgUp({
      cwd
    }));
  } catch (e) {
    return []
  }

  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {}),
  }

  debug('Filter commits by package path: "%s"', packagePath);

  const commitsWithFiles = await withFiles(commits);

  return await filterAsync(commitsWithFiles, async ({files, subject}) => {
    let modifiedDependency;

    for (const file of files) {
      const filePkg = await pkgUp({
        cwd: path.dirname(path.resolve(gitRoot, file))
      });

      if (filePkg) {
        try {
          const filePkgJson = require(filePkg)

          if (dependencies[filePkgJson.name]) {
            modifiedDependency = filePkgJson.name
            break
          }
        } catch (e) {
          // JSON is invalid
          continue
        }
      }
    }

    if (modifiedDependency) {
      debug(
        'Including commit "%s" because it modified package file "%s".',
        subject,
        modifiedDependency
      );
    }

    return !!modifiedDependency
  });
};

const bothPackageOnlyAndDependentCommits = async commits => {
  const packageCommits = await onlyPackageCommits(commits);
  const dependentCommits = await onlyDependentCommits(commits);

  return packageCommits.concat(dependentCommits).filter(onlyUnique);
};

const onlyUnique = (value, index, array) => {
  return array.indexOf(value) === index;
};

// Async version of Ramda's `tap`
const tapA = fn => async x => {
  await fn(x);
  return x;
};

const logFilteredCommitCount = logger => async ({commits}) => {
  const {name} = await readPkg();

  logger.log(
    'Found %s commits for package %s since last release',
    commits.length,
    name
  );
};

const withBothPackageOnlyAndDependentCommits = plugin => async (pluginConfig, config) => {
  const {logger} = config;

  return plugin(
    pluginConfig,
    await pipeP(
      mapCommits(bothPackageOnlyAndDependentCommits),
      tapA(logFilteredCommitCount(logger))
    )(config)
  );
};

export {withBothPackageOnlyAndDependentCommits, onlyPackageCommits, onlyDependentCommits, withFiles};
