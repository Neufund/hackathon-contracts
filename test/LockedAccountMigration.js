import { expect } from "chai";
import { hasEvent, eventValue } from "./helpers/events";
import * as chain from "./helpers/spawnContracts";
import { latestTimestamp } from "./helpers/latestTime";
import EvmError from "./helpers/EVMThrow";

const TestLockedAccountMigrationTarget = artifacts.require(
  "TestLockedAccountMigrationTarget"
);

contract("TestLockedAccountMigrationTarget", ([admin, investor, investor2]) => {
  let startTimestamp;
  let migrationTarget;

  beforeEach(async () => {
    await chain.spawnLockedAccount(admin, 18, 0.1);
    // achtung! latestTimestamp() must be called after a block is mined, before that time is not accurrate
    startTimestamp = latestTimestamp();
    await chain.spawnPublicCommitment(
      admin,
      startTimestamp,
      chain.months,
      chain.ether(1),
      chain.ether(2000),
      chain.ether(1),
      300.1219871
    );
    migrationTarget = await TestLockedAccountMigrationTarget.new(
      chain.accessControl.address,
      chain.etherToken.address,
      chain.neumark.address,
      18 * chain.months,
      chain.ether(1).mul(0.1).round()
    );
    const lockedAccountAdminRole = await chain.accessRoles.ROLE_LOCKED_ACCOUNT_ADMIN();
    await chain.accessControl.setUserRole(
      admin,
      lockedAccountAdminRole,
      migrationTarget.address,
      1
    );
  });

  // it -> check in invalid states in enableMigration

  it("call migrate not from source should throw", async () => {
    // this dummy setting should pass
    await migrationTarget.setMigrationSource(investor2, { from: admin });
    await migrationTarget.migrateInvestor(investor, 1, 1, startTimestamp, {
      from: investor2
    });
    // this should not, only investor2 (which is source) can call migrate on target
    await expect(
      migrationTarget.migrateInvestor(investor, 1, 1, startTimestamp, {
        from: investor
      })
    ).to.be.rejectedWith(EvmError);
  });

  it("target that returns false on migration should throw", async () => {
    const ticket = chain.ether(1);
    const neumarks = ticket.mul(6.5);
    // lock investor
    await chain.commitment._investFor(investor, ticket, neumarks, {
      value: ticket,
      from: investor
    });
    await migrationTarget.setMigrationSource(chain.lockedAccount.address, {
      from: admin
    });
    await chain.lockedAccount.enableMigration(migrationTarget.address, {
      from: admin
    });

    await migrationTarget.setShouldMigrationFail(true, { from: admin });
    await expect(
      chain.lockedAccount.migrate({ from: investor })
    ).to.be.rejectedWith(EvmError);
  });

  it("target with invalid source should throw", async () => {
    // we set invalid source here
    await migrationTarget.setMigrationSource(investor, { from: admin });
    // accepts only lockedAccount as source
    await expect(
      chain.lockedAccount.enableMigration(migrationTarget.address)
    ).to.be.rejectedWith(EvmError);
  });

  async function migrateOne() {
    const ticket = chain.ether(1);
    const neumarks = ticket.mul(6.5);
    // lock investor
    await chain.commitment._investFor(investor, ticket, neumarks, {
      value: ticket,
      from: investor
    });
    let investorBalance = await chain.lockedAccount.balanceOf(investor);
    await migrationTarget.setMigrationSource(chain.lockedAccount.address, {
      from: admin
    });
    assert.equal(
      await migrationTarget.getMigrationFrom(),
      chain.lockedAccount.address,
      "correct migration source set"
    );
    let tx = await chain.lockedAccount.enableMigration(
      migrationTarget.address,
      { from: admin }
    );
    let event = eventValue(tx, "MigrationEnabled");
    expect(event).to.exist;
    expect(event.args.target).to.be.equal(migrationTarget.address);
    // migrate investor
    tx = await chain.lockedAccount.migrate({ from: investor });
    event = eventValue(tx, "InvestorMigrated");
    expect(event).to.exist;
    expect(event.args.investor).to.be.equal(investor);
    expect(event.args.amount).to.be.bignumber.equal(ticket);
    expect(event.args.neumarks).to.be.bignumber.equal(neumarks);
    expect(event.args.unlockDate).to.be.bignumber.equal(investorBalance[2]);
    // check invariants
    expect(await chain.lockedAccount.totalLockedAmount()).to.be.bignumber.equal(
      0
    );
    expect(await migrationTarget.totalLockedAmount()).to.be.bignumber.equal(
      ticket
    );
    expect(await chain.lockedAccount.totalInvestors()).to.be.bignumber.equal(0);
    expect(await migrationTarget.totalInvestors()).to.be.bignumber.equal(1);
    // check balance on old - no investor
    investorBalance = await chain.lockedAccount.balanceOf(investor);
    // unlockDate == 0: does not exit
    expect(
      investorBalance[2],
      "unlockDate zeroed == no account"
    ).to.be.bignumber.equal(0);
  }

  it("should migrate investor", async () => {
    await migrateOne();
  });

  it("migrate same investor twice should do nothing", async () => {
    await migrateOne();
    const tx = await chain.lockedAccount.migrate({ from: investor });
    expect(hasEvent(tx, "InvestorMigrated")).to.be.false;
  });

  it("migrate non existing investor should do nothing", async () => {
    await migrateOne();
    const tx = await chain.lockedAccount.migrate({ from: investor2 });
    expect(hasEvent(tx, "InvestorMigrated")).to.be.false;
  });

  it("enabling migration for a second time should throw", async () => {
    await migrationTarget.setMigrationSource(chain.lockedAccount.address, {
      from: admin
    });
    await chain.lockedAccount.enableMigration(migrationTarget.address, {
      from: admin
    });
    // must throw
    await expect(
      chain.lockedAccount.enableMigration(migrationTarget.address)
    ).to.be.rejectedWith(EvmError);
  });
});
