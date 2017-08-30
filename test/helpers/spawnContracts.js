import { TriState, EVERYONE } from "./triState";

const LockedAccount = artifacts.require("LockedAccount");
const EtherToken = artifacts.require("EtherToken");
const Neumark = artifacts.require("Neumark");
const TestCommitment = artifacts.require("TestCommitment");
const WhitelistedCommitment = artifacts.require("WhitelistedCommitment");
const RoleBasedAccessControl = artifacts.require("RoleBasedAccessControl");
const AccessRoles = artifacts.require("AccessRoles");

const BigNumber = web3.BigNumber;

/* eslint-disable */
export let neumark;
export let etherToken;
export let lockedAccount;
export let curve;
export let commitment;
export let feePool;
export let accessControl;
export let accessRoles;
/* eslint-enable */
export const operatorWallet = "0x55d7d863a155f75c5139e20dcbda8d0075ba2a1c";

export const days = 24 * 60 * 60;
export const months = 30 * 24 * 60 * 60;
export const ether = wei => new BigNumber(wei).mul(10 ** 18);

export async function spawnAccessControl() {
  accessControl = await RoleBasedAccessControl.new();
  accessRoles = await AccessRoles.new();
}

export async function spawnEtherToken() {
  await spawnAccessControl();
  etherToken = await EtherToken.new(accessControl.address);
}

export async function spawnLockedAccount(
  lockAdminAccount,
  unlockDateMonths,
  unlockPenalty
) {
  await spawnEtherToken();
  neumark = await Neumark.new(accessControl.address);
  lockedAccount = await LockedAccount.new(
    accessControl.address,
    etherToken.address,
    neumark.address,
    unlockDateMonths * months,
    ether(1).mul(unlockPenalty).round()
  );
  const lockedAccountAdminRole = await accessRoles.ROLE_LOCKED_ACCOUNT_ADMIN();
  await accessControl.setUserRole(
    lockAdminAccount,
    lockedAccountAdminRole,
    lockedAccount.address,
    TriState.Allow
  );
  await lockedAccount.setPenaltyDisbursal(operatorWallet, {
    from: lockAdminAccount
  });

  // TODO: Restrict to correct spawened contracts
  await accessControl.setUserRole(
    EVERYONE,
    await accessRoles.ROLE_SNAPSHOT_CREATOR(),
    neumark.address,
    TriState.Allow
  );
  await accessControl.setUserRole(
    EVERYONE,
    await accessRoles.ROLE_NEUMARK_ISSUER(),
    neumark.address,
    TriState.Allow
  );
  await accessControl.setUserRole(
    EVERYONE,
    await accessRoles.ROLE_NEUMARK_BURNER(),
    neumark.address,
    TriState.Allow
  );
  await accessControl.setUserRole(
    EVERYONE,
    await accessRoles.ROLE_TRANSFERS_ADMIN(),
    neumark.address,
    TriState.Allow
  );
}

export async function spawnPublicCommitment(
  lockAdminAccount,
  startTimestamp,
  duration,
  minAbsCap,
  maxAbsCap,
  minTicket,
  eurEthRate
) {
  commitment = await TestCommitment.new(
    accessControl.address,
    etherToken.address,
    lockedAccount.address,
    neumark.address
  );
  await commitment.setCommitmentTerms(
    startTimestamp,
    startTimestamp + duration,
    minAbsCap,
    maxAbsCap,
    minTicket,
    ether(eurEthRate),
    operatorWallet
  );
  // console.log(lockedAccount.setController);
  await lockedAccount.setController(commitment.address, {
    from: lockAdminAccount
  });
}

export async function spawnWhitelistedCommitment(
  lockAdminAccount,
  whitelistAdminAccount,
  startTimestamp,
  duration,
  minAbsCap,
  maxAbsCap,
  minTicket,
  eurEthRate
) {
  commitment = await WhitelistedCommitment.new(
    accessControl.address,
    etherToken.address,
    lockedAccount.address,
    neumark.address
  );
  await commitment.setCommitmentTerms(
    startTimestamp,
    startTimestamp + duration,
    minAbsCap,
    maxAbsCap,
    minTicket,
    ether(eurEthRate),
    operatorWallet
  );
  // console.log(lockedAccount.setController);
  const whitelistAdminRole = await accessRoles.ROLE_WHITELIST_ADMIN();
  await accessControl.setUserRole(
    whitelistAdminAccount,
    whitelistAdminRole,
    commitment.address,
    TriState.Allow
  );
  await lockedAccount.setController(commitment.address, {
    from: lockAdminAccount
  });
}
