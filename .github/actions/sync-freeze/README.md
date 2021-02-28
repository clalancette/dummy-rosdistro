# Sync freeze checker

Check if this PR changes a file in a ROS distribution, and if so, check if that distribution is in freeze.

## Usage

### Create Workflow

Create a workflow (eg: `.github/workflows/sync-freeze.yml` see [Creating a Workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file)) to utilize the sync-freeze action with content:

```
name: "Sync freeze"
on:
- pull_request_target

jobs:
  check-distro-freeze:
    runs-on: ubuntu-latest
    steps:
    - name: Clone Repo
      uses: actions/checkout@v2
      with:
        # We always want to checkout the 'main' branch as that tells us
        # the current state of the sync freezes
        ref: 'main'

    - name: Sync Freeze Check
      uses: ./.github/actions/sync-freeze
      with:
        repo-token: "${{ secrets.GITHUB_TOKEN }}"
```

_Note: This grants access to the `GITHUB_TOKEN` so the action can make calls to GitHub's rest API_

#### Inputs

Various inputs are defined in [`action.yml`](action.yml) to let you configure the sync freeze:

| Name | Description | Default |
| - | - | - |
| `repo-token` | Token to use to authorize label changes. Typically the GITHUB_TOKEN secret | N/A |

## Building

This project is written in [TypeScript](https://www.typescriptlang.org/), a typed variant of JavaScript.

Because of how GitHub Actions are run, the source code of this project is transpiled from TypeScript into JavaScript. The transpiled code (found in `lib/`) is subsequently compiled using [NCC](https://github.com/vercel/ncc/blob/master/readme.md) avoid having to include the `node_modules/` directory in the repository.

To build the transpiled code:

1. Configure and install the dependencies: `npm install`
1. Make your change and build the action using `npm run build`
