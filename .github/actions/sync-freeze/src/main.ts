import * as core from "@actions/core";
import * as github from "@actions/github";
import * as yaml from "js-yaml";

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

        for (const filename of changedFiles) {
            console.log(`filename is ${filename}`);
            const modified_distro: string = path.dirname(filename);
            console.log(`Modified distro is ${modified_distro}`);
            if (frozen_distros.has(modified_distro) && frozen_distros.get(modified_distro)) {
                console.log("In freeze!");
                // FIXME: if we are in freeze, we can do one or more of the following:
                // - Add a comment to the PR saying "ROS distribution 'foo' is in sync freeze, holding..."
                // - Add a label to the PR with "sync-freeze"
                // - Fail the CI check
                //client.issues.createComment({...repo, body: "hello", issue_number: prNumber});
                core.setFailed(`ROS distribution ${modified_distro} is in freeze`);
                return;
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

run();
