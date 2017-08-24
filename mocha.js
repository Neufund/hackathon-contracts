import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiBignumber from "chai-bignumber";

const GetNumber = artifacts.require("./test/GetNumber.sol");

// Truffle creates a new BigNumber library instance during
// runtime and chai-bignumber insists that two number need
// to come from the same library instance. To solve this,
// we extract the instance from Truffle and expose it to
// chai-bignumber and globally.
before(async () => {
  // Spawn a cotnract, get a number and steal the lib.
  const getNumber = await GetNumber.new();
  const number = await getNumber.number.call();
  const BigNumber = number.constructor;

  // Feed it to chai and global.
  chai.use(chaiAsPromised).use(chaiBignumber(BigNumber));
  global.BigNumber = BigNumber;
});
