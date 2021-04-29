[![Build And Test](https://github.com/Avallone-io/template-lib/actions/workflows/build-and-test.yml/badge.svg?branch=master)](https://github.com/Avallone-io/template-lib/actions/workflows/build-and-test.yml)
[![.github/workflows/release.yml](https://github.com/Avallone-io/template-lib/actions/workflows/release.yml/badge.svg?branch=master)](https://github.com/Avallone-io/template-lib/actions/workflows/release.yml)

## Description
Template repository for Avallone libraries

## Publishing
The publishing is done automatically via Github actions.
The `.npmrc` uses `@avallone-io:registry=https://npm.pkg.github.com` as scope to match the Avallone Github registry.

## Using the libraries

### Registry login
Before you can use Avallone packages, you have to login into Github npm registry.
1. Start by generating a personal access token with the following scopes: ['repo', 'write:packages', 'delete:packages', 'read:user', 'read:email']
2. Copy the generated token (this will be your **password**)
3. Run the following: `npm login --scope=@avallone-io --registry=https://npm.pkg.github.com`. Follow the instructions and add your Github User, for password use the token generated in 2) and finally, add your email
4. Now you should be able to install `@avallone-io` scoped packages.
