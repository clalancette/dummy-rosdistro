import * as core from "@actions/core";
import * as github from "@actions/github";
import * as yaml from "js-yaml";
import { Minimatch, IMinimatch } from "minimatch";

interface MatchConfig {
  all?: string[];
  any?: string[];
}

type StringOrMatchConfig = string | MatchConfig;

const fs = require("fs");
const path = require("path");

async function run() {
    try {
        const token = core.getInput("repo-token", { required: true });

        const prNumber = getPrNumber();
        if (!prNumber) {
            console.log("Could not get pull request number from context, exiting");
            return;
        }

        const client = new github.GitHub(token);

        // FIXME: do we need this at all?
        const { data: pullRequest } = await client.pulls.get({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber
        });

        console.log(`fetching changed files for pr #${prNumber}`);

        core.debug(`fetching changed files for pr #${prNumber}`);
        const changedFiles: string[] = await getChangedFiles(client, prNumber);
        console.log(`changed files: ${changedFiles}`);

        console.log(`About to read sync-freeze.yml`);
        // FIXME: does this take into account changes to sync-freeze by *this* PR?
        const sync_freeze = readSyncFreeze("sync-freeze.yaml");
        const frozen_distros: Map<string, boolean> = new Map();
        for (const distro in sync_freeze["distributions"]) {
            frozen_distros.set(distro, sync_freeze["distributions"][distro]["freeze"]);
        }

        const repo = github.context.repo;

        var modifies_sync_freeze: boolean = false;
        for (const filename of changedFiles) {
            if (filename === "sync-freeze.yaml") {
                modifies_sync_freeze = true;
                continue;
            }
            console.log(`filename is ${filename}`);
            const modified_distro: string = path.dirname(filename);
            console.log(`Modified distro is ${modified_distro}`);
            if (frozen_distros.has(modified_distro) && frozen_distros.get(modified_distro)) {
                console.log("In freeze!");
                //client.issues.createComment({...repo, body: "hello", issue_number: prNumber});
                core.error(`ROS distribution ${modified_distro} is in freeze`);
                core.setFailed(`ROS distribution ${modified_distro} is in freeze`);
                return;
            }
        }

        // FIXME: Temporary just for testing
        modifies_sync_freeze = true;
        if (modifies_sync_freeze) {
            const prList: Array<number> = await getOpenPRs(client);
            // FIXME: maybe we can combine this with the list in getOpenPRs for performance
            for (const pr of prList) {
                // Skip this PR in the list
                if (pr == prNumber) {
                    continue;
                }

                console.log(`Looking at PR #{pr}`);

                // FIXME: the below is an attempt to make kicking other PRs a little more targeted (so we only kick those who have changed)
                // const otherFiles: string[] = await getChangedFiles(client, pr);
                // for (const filename of changedFiles) {
                //     console.log(`other filename is ${filename}`);
                //     const modified_distro: string = path.dirname(filename);
                // }
            }
        }
    } catch (error) {
        core.error(error);
        core.setFailed(error.message);
    }
}

function getPrNumber(): number | undefined {
    const pullRequest = github.context.payload.pull_request;
    if (!pullRequest) {
        return undefined;
    }

    return pullRequest.number;
}

async function getChangedFiles(
    client: github.GitHub,
    prNumber: number
): Promise<string[]> {
    const listFilesOptions = client.pulls.listFiles.endpoint.merge({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: prNumber
    });

    const listFilesResponse = await client.paginate(listFilesOptions);
    const changedFiles = listFilesResponse.map(f => f.filename);

    core.debug("found changed files:");
    for (const file of changedFiles) {
        core.debug("  " + file);
    }

    return changedFiles;
}

function readSyncFreeze(filename: string): any {
    // FIXME: Make this async?
    const rawdata = fs.readFileSync(filename);

    const sync_freeze: any = yaml.safeLoad(rawdata);

    return sync_freeze
}

async function getOpenPRs(client: github.GitHub): Promise<number[]> {
    // FIXME: .endpoint.merge here, followed by paginate like above?
    const prList = await client.pulls.list({
        state: 'open',
        owner: github.context.repo.owner,
        repo: github.context.repo.repo
    })

    var prNums = new Array<number>();
    for (const pr of prList.data) {
        prNums.push(pr.number);
        //const prNum = pr.number;
        //const prState = pr.state;
        //console.log(`PR #${prNum}, state: ${prState}`);
    }

    return prNums;
}

async function getLabelGlobs(
  client: github.GitHub,
  configurationPath: string
): Promise<Map<string, StringOrMatchConfig[]>> {
  const configurationContent: string = await fetchContent(
    client,
    configurationPath
  );

  // loads (hopefully) a `{[label:string]: string | StringOrMatchConfig[]}`, but is `any`:
  const configObject: any = yaml.safeLoad(configurationContent);

  // transform `any` => `Map<string,StringOrMatchConfig[]>` or throw if yaml is malformed:
  return getLabelGlobMapFromObject(configObject);
}

async function fetchContent(
  client: github.GitHub,
  repoPath: string
): Promise<string> {
  const response: any = await client.repos.getContents({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    path: repoPath,
    ref: github.context.sha
  });

  return Buffer.from(response.data.content, response.data.encoding).toString();
}

function getLabelGlobMapFromObject(
  configObject: any
): Map<string, StringOrMatchConfig[]> {
  const labelGlobs: Map<string, StringOrMatchConfig[]> = new Map();
  for (const label in configObject) {
    if (typeof configObject[label] === "string") {
      labelGlobs.set(label, [configObject[label]]);
    } else if (configObject[label] instanceof Array) {
      labelGlobs.set(label, configObject[label]);
    } else {
      throw Error(
        `found unexpected type for label ${label} (should be string or array of globs)`
      );
    }
  }

  return labelGlobs;
}

function toMatchConfig(config: StringOrMatchConfig): MatchConfig {
  if (typeof config === "string") {
    return {
      any: [config]
    };
  }

  return config;
}

function printPattern(matcher: IMinimatch): string {
  return (matcher.negate ? "!" : "") + matcher.pattern;
}

function checkGlobs(
  changedFiles: string[],
  globs: StringOrMatchConfig[]
): boolean {
  for (const glob of globs) {
    core.debug(` checking pattern ${JSON.stringify(glob)}`);
    const matchConfig = toMatchConfig(glob);
    if (checkMatch(changedFiles, matchConfig)) {
      return true;
    }
  }
  return false;
}

function isMatch(changedFile: string, matchers: IMinimatch[]): boolean {
  core.debug(`    matching patterns against file ${changedFile}`);
  for (const matcher of matchers) {
    core.debug(`   - ${printPattern(matcher)}`);
    if (!matcher.match(changedFile)) {
      core.debug(`   ${printPattern(matcher)} did not match`);
      return false;
    }
  }

  core.debug(`   all patterns matched`);
  return true;
}

// equivalent to "Array.some()" but expanded for debugging and clarity
function checkAny(changedFiles: string[], globs: string[]): boolean {
  const matchers = globs.map(g => new Minimatch(g));
  core.debug(`  checking "any" patterns`);
  for (const changedFile of changedFiles) {
    if (isMatch(changedFile, matchers)) {
      core.debug(`  "any" patterns matched against ${changedFile}`);
      return true;
    }
  }

  core.debug(`  "any" patterns did not match any files`);
  return false;
}

// equivalent to "Array.every()" but expanded for debugging and clarity
function checkAll(changedFiles: string[], globs: string[]): boolean {
  const matchers = globs.map(g => new Minimatch(g));
  core.debug(` checking "all" patterns`);
  for (const changedFile of changedFiles) {
    if (!isMatch(changedFile, matchers)) {
      core.debug(`  "all" patterns did not match against ${changedFile}`);
      return false;
    }
  }

  core.debug(`  "all" patterns matched all files`);
  return true;
}

function checkMatch(changedFiles: string[], matchConfig: MatchConfig): boolean {
  if (matchConfig.all !== undefined) {
    if (!checkAll(changedFiles, matchConfig.all)) {
      return false;
    }
  }

  if (matchConfig.any !== undefined) {
    if (!checkAny(changedFiles, matchConfig.any)) {
      return false;
    }
  }

  return true;
}

async function addLabels(
  client: github.GitHub,
  prNumber: number,
  labels: string[]
) {
  await client.issues.addLabels({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: prNumber,
    labels: labels
  });
}

async function removeLabels(
  client: github.GitHub,
  prNumber: number,
  labels: string[]
) {
  await Promise.all(
    labels.map(label =>
      client.issues.removeLabel({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: prNumber,
        name: label
      })
    )
  );
}

run();
