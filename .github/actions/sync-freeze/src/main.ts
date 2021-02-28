import * as core from "@actions/core";
import * as github from "@actions/github";
import * as yaml from "js-yaml";
import { promises as fs } from "fs";

const path = require("path");

async function run() {
    try {
        const token = core.getInput("repo-token", { required: true });

        const pullRequest = github.context.payload.pull_request;
        if (!pullRequest) {
            console.log("Could not get pull request number from context, exiting");
            return;
        }
        const prNumber = pullRequest.number;

        const client = new github.GitHub(token);

        console.log(`fetching changed files for pr #${prNumber}`);

        core.debug(`fetching changed files for pr #${prNumber}`);
        const changedFiles: string[] = await getChangedFiles(client, prNumber);
        console.log(`changed files: ${changedFiles}`);

        console.log(`About to read sync-freeze.yml`);
        // This reads the sync-freeze.yaml value for whatever branch/tag was specified
        // in the workflow file.  Since that should (usually) be the 'master' branch,
        // that means that you cannot both freeze/unfreeze a distribution and make changes to
        // the distribution in the same PR.
        const sync_data = await fs.readFile("sync-freeze.yaml", "utf8");
        const sync_freeze = yaml.safeLoad(sync_data);

        const frozen_distros: Map<string, boolean> = new Map();
        for (const distro in sync_freeze["distributions"]) {
            frozen_distros.set(distro, sync_freeze["distributions"][distro]["freeze"]);
        }

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
                //const repo = github.context.repo;
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

run();
