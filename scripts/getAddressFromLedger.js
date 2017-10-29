/* eslint-disable no-console */
/**
 * Simple script to get address from ledger using different derivation paths
 * usage: yarn ledgeraddresss "44'/60'/0'/1" if you leave it empty you will get default path
 */
// eslint-disable-next-line import/no-extraneous-dependencies
const ledger = require("ledgerco");

const TIMEOUT = 5 * 1000;
const DEFAULT_PATH = "44'/60'/0'/0";

const path = process.argv[2] || DEFAULT_PATH;
console.log("checking path:", path);

ledger.comm_node
  .create_async(TIMEOUT)
  .then(comm => {
    // eslint-disable-next-line new-cap
    const eth = new ledger.eth(comm);
    return eth
      .getAddress_async(path)
      .then(result => {
        console.log(result);
        comm.close_async();
      })
      .catch(err => console.log(err));
  })
  .catch(err => console.log(err));
