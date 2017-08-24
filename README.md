# ICO contracts

This project requires `solc` version 0.4.15 to be installed and available. You can download `solc` for your platform [here][solc].

[solc]: https://github.com/ethereum/solidity/releases/tag/v0.4.15


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
