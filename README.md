# ALM Octane Create Branch External Action

### Description

This is a Node.js app that will listen for requests from Octane. Once a request is received, it will start the process
of creating a branch in the selected repository and in Octane. Currently, this tool will only create branches in:

* Bitbucket Server
* Bitbucket Cloud
* Github Cloud

## Installation

### Prerequisites

* Node version: 12.14.1 or above
* Npm version: 6.13.4 or above
* Connection to and from Octane
* Connection to Bitbucket Server, Bitbucket Cloud and/or Github Cloud

### Configuration

First, you need to clone this repository and run `npm install`. Then you need to create an `.env` file in the project
root directory. Copy the content of the `env.txt`
file in the newly created `.env` file. This application
uses [cookie session](https://www.npmjs.com/package/cookie-session)
which encrypts some data and saves it in a cookie. This encryption is done using the `COOKIE_SECRET` parameter. You need
to assign a random string to this parameter. You can also set the `PORT` variable if you want the app to run on another
port (the default being port 9000).

Next, you need to configure at least one of the following 3 options: [Bitbucket Server](#bitbucket-server)
, [Bitbucket Cloud](#bitbucket-cloud) or [Github Cloud](#github-cloud)

#### Bitbucket Server

Required parameters in the `.env` file:

* `BITBUCKET_SERVER_PERSONAL_ACCESS_TOKEN`:
  You will need to create
  a [Personal Access Token](https://confluence.atlassian.com/bitbucketserver/personal-access-tokens-939515499.html). We
  recommend creating a new "bot" user which has access to all the repositories in which you want to create branches and
  getting the Personal Access Token for that user instead of creating it for a real user. The minimum Permissions the
  token needs to have is `Read` for Projects and `Write` for Repositories

* `BITBUCKET_SERVER_REPOSITORIES`:
  Comma separated http links to the repositories in which you want to create branches. Example:
  ```
  BITBUCKET_SERVER_REPOSITORIES=http://myBitbucketServer/scm/ProjectSlug1/repo1.git, https://otherBitbucketServer/scm/ProjectSlug2/repo2.git
  ```

The only other requirement is finishing the [Octane](#octane) setup.

#### Bitbucket Cloud

Required parameters in the `.env` file:

* `BITBUCKET_CLOUD_CLIENT_ID` & `BITBUCKET_CLOUD_CLIENT_SECRET`: You will need to create an
  [Oauth consumer](https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/)
  The Callback URL needs to be `http://<appUrl>:<appPort>/login/bitbucket/cloud/callback` where `<appUrl>`
  and  `<appPort>` are the url and port of this app. The minimum Permissions required are `Read` for Projects
  and `Write`
  for Repositories. Once the Oauth consumer was created, click on the consumer name in Bitbucket and copy the **Key**
  and **Secret**.


* `BITBUCKET_CLOUD_REPOSITORIES`:
  Comma separated http links to the repositories in which you want to create branches. Example:
  ```
  BITBUCKET_CLOUD_REPOSITORIES=https://myUser@bitbucket.org/myUser/Repo1.git, https://myUser@bitbucket.org/myUser/Repo2.git
  ```

The only other requirement is finishing the [Octane](#octane) setup.

#### Github Cloud

Required parameters in the `.env` file:

* `GITHUB_CLOUD_CLIENT_ID` & `GITHUB_CLOUD_CLIENT_SECRET`: You will need to create an
  [Oauth app](https://docs.github.com/en/developers/apps/building-oauth-apps/creating-an-oauth-app)
  The Callback URL needs to be `http://<appUrl>:<appPort>/login/github/cloud/callback` where `<appUrl>`
  and  `<appPort>` are the url and port of this app. Once the Oauth app was created, you will also need to generate a
  client secret. Copy the
  `Client ID` and the generated client secret in the `.env` file


* `GITHUB_CLOUD_REPOSITORIES`:
  Comma separated http links to the repositories in which you want to create branches. Example:
  ```
  GITHUB_CLOUD_REPOSITORIES=https://github.com/myUser/myRepo1.git, https://github.com/myUser/myRepo2.git
  ```

The only other requirement is finishing the [Octane](#octane) setup.

### Octane

In order to call this app, you will need to set up
an [external action](https://admhelp.microfocus.com/octane/en/15.1.60/Online/Content/AdminGuide/custom-buttons.htm)
in Octane. The JSON you need to add is the one below. You need to replace `<appUrl>` and  `<appPort>` with the url and
port of this app

```
[
  {
    "name": "CreateBranch",
    "title": "Create Branch",
    "entity_type": [
      "feature","defect","story","quality_story"
    ],
    "views": [
      "details",
      "list"
    ],
    "icon": "plus",
    "url": "http://<appUrl>:<appPort>/repo_select?subtype={entity.subtype}&name={entity.name}&entity_id={entity_ids}&shared_space_id={shared_space}&workspace_id={workspace}",
    "single_entity": true
  }
]
```

Required parameters in the `.env` file:

* `DOES_OCTANE_SUPPORT_BRANCHES`: If set to `true`, it will make this app also create a branch entity in Octane after
  successfully creating the branch in the repository, but since Octane only recently started supporting branches, you
  need to check if your Octane version has this functionality. An easy way to check is going to the Team Backlog or
  opening a work item (e.g. User Story) and checking if you have a branches tab. If your Octane version does not support
  branches, this field should be set to `false` in which case the other octane related parameters become irrelevant.
* `OCTANE_URL`: the url to Octane (including the port) . Example: `OCTANE_URL=http://myOctaneServer:8080`
* `OCTANE_SHARED_SPACES`, `OCTANE_USERS` & `OCTANE_PASSWORDS`: Comma
  separated [API access keys](https://admhelp.microfocus.com/octane/en/15.1.60/Online/Content/AdminGuide/how_setup_APIaccess.htm#mt-item-2)
  for each shared space. The order is important. Example:
  ```
    OCTANE_SHARED_SPACES=1001, 2002, 3003
    OCTANE_USERS= apiAccessKeyForSharedSpace1001,apiAccessKeyForSharedSpace2002,apiAccessKeyForSharedSpace3003
    OCTANE_PASSWORDS= apiAccessSecretForSharedSpace1001, apiAccessSecretForSharedSpace2002, apiAccessSecretForSharedSpace3003
  ```

Once all the `.env` parameters were set, you can start the app by running `npm start`

## Limitations

* This application cannot create a branch in Octane if your Octane version does not support branches.
* If there already exists a branch in Octane with the same name and for the same repository, but not in the actual
  repository (e.g. an existing branch was deleted), when creating the branch in Octane, the operation might fail (
  depending on the Octane version). You might need to go to the existing branch and update it (mark it as not deleted).
