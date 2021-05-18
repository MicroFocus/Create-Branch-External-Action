# Feature [1118032](https://center.almoctane.com/ui/entity-navigation?p=1001/26002&entityType=work_item&id=1118032): Create git branch from Octane (CFRD Workspace) & Feature [1024029](https://center.almoctane.com/ui/entity-navigation?p=1001/1002&entityType=work_item&id=1024029): [SCM Branch] Create branches per work item (Match Jira) (ALM Octane R&D Workspace)
 

## Authors

Alexander Stanciu

## Reviewers

Alex Schnayder

## Description

Add a button that creates a branch for the current work item in BitBucket or GitHub. 
The name of the new branch should match one of the SCM Change patterns.

## Design

We will make a node js app. An external action will be configured for each work item. 
The external action will call the app and provide the `subtype`, `name` and `id` of the work item.

For the moment, there will be 2 handlers for creating branches: one for Bitbucket and one for Github.
Both handlers will use the same branch naming utility.
The naming utility will fetch from octane all the `SCM Change Patterns` that apply to branches for the given subtype. 
It will replace the `(\d+)` group with the id given, and the resulting name will be `<pattern with replaced id> - Work Item name`
If multiple patterns are available, the user will select which one to use. 
The name will still be able to be modified by the user if they wish to do so.


After invoking the app, if multiple repositories are configured for the app, 
the user will first have to select which one to use. This will decide which handler is used.

* BitBucket handler:
    * The user will be redirected to the BitBucket branch creation page with the name of the branch filled in using 
      the query parameter `issueSummary`

* GitHub handler:
    * The user will be redirected to github to log in through an OAuth app (which was previously created by an admin for our app)
    * After the user authorises the OAuth app, Github will redirect the user back to our app with a code.
    * Using the code, OAuth app id and secret, our app will request a token from github which will be stored in a cookie using cookie-session.
    * The app will fetch all the available branches for the repository
    * After the user from which branch to create the new branch, the app will use the stored token to create the branch.
    

### Considered and Rejected Solutions

#### Uploading the script to Octane:
Initially, we wanted to use the [reduce external action TCO by allowing hosting of external actions in Octane instead of external server](https://center.almoctane.com/ui/entity-navigation?p=1001/1002&entityType=work_item&id=1135020)
feature in order to reduce the work the clients would have to do with setting everything up. Unfortunately, there were 2 security related issues that prevented us from using this feature: 
1. When uploading a bundle, all the files could be accessed. This means that there is no way of keeping a secret text
   hidden, and the Github OAuth app does require a secret.
2. Github [OAuth web flow endpoints don't support CORS](https://github.com/isaacs/github/issues/330). 
   There are workarounds, but they would require use of third party apps which might not be secured. 
   
#### Creating a branch entry in Octane
Jenkins will be responsible for bringing the newly created branch back in Octane. This is because if there are two ways
of getting the same branches in Octane, duplication might occur (if not now, maybe in the future when one of the tools will change).
The jenkins build can be triggered by either a GitHub or a Bitbucket webhook. 

Another reason is that since for BitBucket we are using a redirect, we don't actually know when or if a branch was created and with what name.

#### Use a redirect for github branch creation
Unlike BitBucket, GitHub does not have a dedicated page for creating a branch. This means that we need to creat it using REST calls.
For this we need to be authenticated and using OAuth, we make sure the user has the required permissions to complete the requests. 
   
#### Adding an external action to the Branch tab
Although it would be possible to add the "Create Branch" button in the Branch tab of a work item by using the entity type `scm_repository`,
there would be no way of sending the `subtype`, `name` and `id` of the work item to the app since the button would no 
longer be related to a work item. 



