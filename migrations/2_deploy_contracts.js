require("babel-register");

const RoleBasedAccessControl = artifacts.require("RoleBasedAccessControl");
const EthereumForkArbiter = artifacts.require("EthereumForkArbiter");
const Neumark = artifacts.require("Neumark");
const LockedAccount = artifacts.require("LockedAccount");
const EtherToken = artifacts.require("EtherToken");
const EuroToken = artifacts.require("EuroToken");
const Commitment = artifacts.require("Commitment");

// Needs to match contracts/AccessControl/RoleBasedAccessControl.sol:TriState
const TriState = { Unset: 0, Allow: 1, Deny: 2 };
const EVERYONE = "0x0";
const GLOBAL = "0x0";
const Q18 = web3.toBigNumber("10").pow(18);

const now = Date.now() / 1000;
const LOCK_DURATION = 18 * 30 * 24 * 60 * 60;
const START_DATE = now + 5 * 24 * 60 * 60;
const PENALTY_FRACTION = web3.toBigNumber("0.1").mul(Q18);
const CAP_EUR = web3.toBigNumber("200000000").mul(Q18);
const MIN_TICKET_EUR = web3.toBigNumber("300").mul(Q18);
const ETH_EUR_FRACTION = web3.toBigNumber("300").mul(Q18);

module.exports = function deployContracts(deployer, network, accounts) {
  deployer.then(async () => {
    const lockedAccountAdmin = accounts[1];
    const whitelistAdmin = accounts[2];
    const platformOperatorWallet = accounts[3];
    const platformOperatorRepresentative = accounts[4];

    console.log("AccessControl deployment...");
    await deployer.deploy(RoleBasedAccessControl);
    const accessControl = await RoleBasedAccessControl.deployed();

    console.log("EthereumForkArbiter deployment...");
    await deployer.deploy(EthereumForkArbiter, accessControl.address);
    const ethereumForkArbiter = await EthereumForkArbiter.deployed();

    console.log("Neumark deploying...");
    await deployer.deploy(
      Neumark,
      accessControl.address,
      ethereumForkArbiter.address
    );
    const neumark = await Neumark.deployed();

    console.log("EtherToken deploying...");
    await deployer.deploy(EtherToken, accessControl.address);
    const etherToken = await EtherToken.deployed();

    console.log("EuroToken deploying...");
    await deployer.deploy(EuroToken, accessControl.address);
    const euroToken = await EuroToken.deployed();

    console.log("LockedAccount(EtherToken) deploying...");
    await deployer.deploy(
      LockedAccount,
      accessControl.address,
      etherToken.address,
      neumark.address,
      LOCK_DURATION,
      PENALTY_FRACTION
    );
    const etherLock = await LockedAccount.deployed();

    console.log("LockedAccount(EuroToken) deploying...");
    await deployer.deploy(
      LockedAccount,
      accessControl.address,
      euroToken.address,
      neumark.address,
      LOCK_DURATION,
      PENALTY_FRACTION
    );
    const euroLock = await LockedAccount.deployed();

    console.log("Commitment deploying...");
    await deployer.deploy(
      Commitment,
      accessControl.address,
      START_DATE,
      platformOperatorWallet,
      neumark.address,
      etherToken.address,
      euroToken.address,
      etherLock.address,
      euroLock.address,
      CAP_EUR,
      MIN_TICKET_EUR,
      ETH_EUR_FRACTION
    );
    const commitment = await Commitment.deployed();

    console.log("Setting permissions");
    await accessControl.setUserRole(
      commitment.address,
      web3.sha3("NeumarkIssuer"),
      GLOBAL,
      TriState.Allow
    );
    await accessControl.setUserRole(
      EVERYONE,
      web3.sha3("NeumarkBurner"),
      GLOBAL,
      TriState.Allow
    );
    await accessControl.setUserRole(
      EVERYONE,
      web3.sha3("SnapshotCreator"),
      neumark.address,
      TriState.Allow
    );
    await accessControl.setUserRole(
      commitment.address,
      web3.sha3("TransfersAdmin"),
      neumark.address,
      TriState.Allow
    );
    await accessControl.setUserRole(
      commitment.address,
      web3.sha3("Transferer"),
      neumark.address,
      TriState.Allow
    );
    await accessControl.setUserRole(
      lockedAccountAdmin,
      web3.sha3("LockedAccountAdmin"),
      GLOBAL,
      TriState.Allow
    );
    await accessControl.setUserRole(
      whitelistAdmin,
      web3.sha3("WhitelistAdmin"),
      commitment.address,
      TriState.Allow
    );
    await accessControl.setUserRole(
      platformOperatorRepresentative,
      web3.sha3("PlatformOperatorRepresentative"),
      GLOBAL,
      TriState.Allow
    );
    await etherLock.setController(commitment.address, {
      from: lockedAccountAdmin
    });
    await euroLock.setController(commitment.address, {
      from: lockedAccountAdmin
    });
    console.log("Amending agreements");
    await neumark.amendAgreement(
      "ipfs:QmPXME1oRtoT627YKaDPDQ3PwA8tdP9rWuAAweLzqSwAWT",
      {
        from: platformOperatorRepresentative
      }
    );
    console.log("Contracts deployed!");

    console.log("----------------------------------");
    console.log(`ICO contract: ${commitment.address}`);
    console.log("----------------------------------");
  });
};
