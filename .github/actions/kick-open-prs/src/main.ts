import * as core from "@actions/core";
import * as github from "@actions/github";
import * as yaml from "js-yaml";
import { promises as fs } from "fs";

const path = require("path");

async function run() {
    try {
        const token = core.getInput("repo-token", { required: true });

        console.log("Starting kick-open-prs");

        const client = new github.GitHub(token);

        const prList: number[] = await getOpenPRs(client);

    } catch (error) {
        core.error(error);
        core.setFailed(error.message);
    }
}

async function getOpenPRs(client: github.GitHub): Promise<Array<number>> {

    console.log("Starting getOpenPRs");

    const prListOptions = await client.pulls.list.endpoint.merge({
        state: 'open',
        owner: github.context.repo.owner,
        repo: github.context.repo.repo
    })

    const prList = await client.paginate(prListOptions);

    console.log("Starting iteration over prList");
    var prNums = new Array<number>();
    for (const pr of prList) {
        const json = JSON.stringify(pr);
        console.log(`PR: ${json}`);
        //prNums.push(pr.number);
    }

    return prNums;
}

run();
