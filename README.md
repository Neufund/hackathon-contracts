# ICO contracts

## Running locally
```
yarn          # installs all dependencies
yarn testrpc  # run testnet

# open new terminal window
yarn deploy
```

## Developing
```
yarn testrpc # run test net
yarn test # run tests
```
Supported compiler: `Version: 0.4.15+commit.bbb8e64f.Linux.g++`
Always use
```
truffle compile --all
```
Truffle is not able to track dependencies correctly and will not recompile files that import other files

### Auto fixing linting problems
```
yarn lint:fix
```

### Test coverage
```
yarn test:coverage
```

you will find coverage report in `coverage/index.html`.

### Testing
To run single test, use following syntax
```
truffle test test/LockedAccount.js test/setup.js
```

To run single test case from a test use following syntax
```
it.only('test case', ...
```
