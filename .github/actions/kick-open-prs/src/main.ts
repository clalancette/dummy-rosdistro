import * as core from "@actions/core";
import * as github from "@actions/github";

async function run() {
    try {
        const token = core.getInput("repo-token", { required: true });

        console.log("Starting kick-open-prs");

        const client = new github.GitHub(token);

        console.log("Starting getOpenPRs");

        const prListOptions = client.pulls.list.endpoint.merge({
            state: 'open',
            owner: github.context.repo.owner,
            repo: github.context.repo.repo
        })

        const prList = await client.paginate(prListOptions);
        for (const pr of prList) {
            const json = JSON.stringify(pr);
            console.log(`PR: ${json}`);
        }

    } catch (error) {
        core.error(error);
        core.setFailed(error.message);
    }
}

run();
