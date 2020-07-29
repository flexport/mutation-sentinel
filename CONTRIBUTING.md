# Contributing

We are open to, and grateful for, any contributions made by the community.  By contributing to Mutation Sentinel, you agree to abide by the [code of conduct](https://github.com/flexport/mutation-sentinel/blob/master/CODE_OF_CONDUCT.md).

## Reporting Issues

Before opening an issue, please search the [issue tracker](https://github.com/flexport/mutation-sentinel/issues) to make sure your issue hasn't already been reported.

## New Features

Please open an issue with a proposal for a new feature or refactoring before starting on the work. We don't want you to waste your efforts on a pull request that we won't want to accept.

## Development

### Building

```
yarn run clean
yarn run build
```

### Testing and linting

```
yarn run flow
yarn run lint
yarn run test
yarn run test:debug
```

## Submitting Changes

* Open a new issue in the [Issue tracker](https://github.com/flexport/mutation-sentinel/issues).
* Fork the repo.
* Create a new feature branch based off the `master` branch.
* Make sure all tests pass and there are no linting errors.
* Submit a pull request, referencing any issues it addresses.

Please try to keep your pull request focused in scope and avoid including unrelated commits.

After you have submitted your pull request, we'll try to get back to you as soon as possible. We may suggest some changes or improvements.

Thank you for contributing!

## Publishing to NPM

1. Make sure the CHANGELOG is updated with the latest changes.
2. `yarn publish`
3. `git push --follow-tags`

