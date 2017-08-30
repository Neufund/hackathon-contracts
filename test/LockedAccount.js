import { expect } from "chai";
import moment from "moment";
import error, { Status } from "./helpers/error";
import { eventValue } from "./helpers/events";
import * as chain from "./helpers/spawnContracts";
import increaseTime, { setTimeTo } from "./helpers/increaseTime";
import { latestTimestamp } from "./helpers/latestTime";
import EvmError from "./helpers/EVMThrow";
import { TriState } from "./helpers/triState";
import forceEther from "./helpers/forceEther";

const TestFeeDistributionPool = artifacts.require("TestFeeDistributionPool");
const TestNullContract = artifacts.require("TestNullContract");
const TestCommitment = artifacts.require("TestCommitment");

const LockState = {
  Uncontrolled: 1,
  AcceptingLocks: 2,
  AcceptingUnlocks: 3,
  ReleaseAll: 4
};

contract("LockedAccount", ([_, admin, investor, investor2]) => {
  let startTimestamp;

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
  });

  it("should be able to read lock parameters", async () => {
    assert.equal(await chain.lockedAccount.totalLockedAmount.call(), 0);
    assert.equal(await chain.lockedAccount.totalInvestors.call(), 0);
    assert.equal(
      await chain.lockedAccount.assetToken.call(),
      chain.etherToken.address
    );
  });

  async function expectLockEvent(tx, investorAddress, ticket, neumarks) {
    const event = eventValue(tx, "FundsLocked");
    expect(event).to.exist;
    expect(event.args.investor).to.equal(investorAddress);
    expect(event.args.amount).to.be.bignumber.equal(ticket);
    expect(event.args.neumarks).to.be.bignumber.equal(neumarks);
  }

  async function lockEther(investorAddress, ticket) {
    // initial state of the lock
    const initialLockedAmount = await chain.lockedAccount.totalLockedAmount();
    const initialAssetSupply = await chain.etherToken.totalSupply();
    const initialNumberOfInvestors = await chain.lockedAccount.totalInvestors();
    const initialNeumarksBalance = await chain.neumark.balanceOf(
      investorAddress
    );
    const initialLockedBalance = await chain.lockedAccount.balanceOf(
      investorAddress
    );
    // issue real neumarks and check against
    let tx = await chain.neumark.issueForEuro(ticket, {
      from: investorAddress
    });
    const neumarks = eventValue(tx, "NeumarksIssued", "neumarkUlp");
    expect(
      await chain.neumark.balanceOf(investorAddress),
      "neumarks must be allocated"
    ).to.be.bignumber.equal(neumarks.add(initialNeumarksBalance));
    // only controller can lock
    tx = await chain.commitment._investFor(investorAddress, ticket, neumarks, {
      value: ticket,
      from: investorAddress
    });
    await expectLockEvent(tx, investorAddress, ticket, neumarks);
    const timebase = latestTimestamp(); // timestamp of block _investFor was mined
    const investorBalance = await chain.lockedAccount.balanceOf(
      investorAddress
    );
    expect(
      investorBalance[0],
      "investor balance should equal locked eth"
    ).to.be.bignumber.equal(ticket.add(initialLockedBalance[0]));
    expect(
      investorBalance[1],
      "investor neumarks due should equal neumarks"
    ).to.be.bignumber.equal(neumarks.add(initialLockedBalance[1]));
    // verify longstop date independently, value is convertable to int so do it
    let unlockDate = timebase + 18 * 30 * chain.days;
    if (parseInt(initialLockedBalance[2], 10) > 0) {
      // earliest date is preserved for repeated investor address
      unlockDate = parseInt(initialLockedBalance[2], 10);
    }
    expect(parseInt(investorBalance[2], 10), "18 months in future").to.equal(
      unlockDate
    );
    expect(
      await chain.lockedAccount.totalLockedAmount(),
      "lock should own locked amount"
    ).to.be.bignumber.equal(initialLockedAmount.add(ticket));
    expect(
      await chain.etherToken.totalSupply(),
      "lock should own locked amount"
    ).to.be.bignumber.equal(initialAssetSupply.add(ticket));
    const newInvestors = parseInt(initialLockedBalance[2], 10) > 0 ? 0 : 1;
    expect(
      await chain.lockedAccount.totalInvestors(),
      "total number of investors"
    ).to.be.bignumber.equal(initialNumberOfInvestors.add(newInvestors));

    return neumarks;
  }

  it("should lock ether", async () => {
    await lockEther(investor, chain.ether(1));
  });

  it("should lock ether two different investors", async () => {
    await lockEther(investor, chain.ether(1));
    await lockEther(investor2, chain.ether(0.5));
  });

  it("should lock ether same investor", async () => {
    await lockEther(investor, chain.ether(1));
    await lockEther(investor, chain.ether(0.5));
  });

  async function unlockEtherWithApprove(
    investorAddress,
    ticket,
    neumarkToBurn
  ) {
    // investor approves transfer to lock contract to burn neumarks
    // console.log(`investor has ${parseInt(await chain.neumark.balanceOf(investor))}`);
    let tx = await chain.neumark.approve(
      chain.lockedAccount.address,
      neumarkToBurn,
      {
        from: investorAddress
      }
    );
    expect(eventValue(tx, "Approval", "amount")).to.be.bignumber.equal(
      neumarkToBurn
    );
    // only investor can unlock and must burn tokens
    tx = await chain.lockedAccount.unlock({ from: investorAddress });

    return tx;
  }

  async function unlockEtherWithCallback(
    investorAddress,
    ticket,
    neumarkToBurn
  ) {
    // investor approves transfer to lock contract to burn neumarks
    // console.log(`investor has ${await chain.neumark.balanceOf(investor)} against ${neumarkToBurn}`);
    // console.log(`${chain.lockedAccount.address} should spend`);
    // await chain.lockedAccount.receiveApproval(investor, neumarkToBurn, chain.neumark.address, "");
    const tx = await chain.neumark.approveAndCall(
      chain.lockedAccount.address,
      neumarkToBurn,
      "",
      {
        from: investorAddress
      }
    );
    expect(eventValue(tx, "Approval", "amount")).to.be.bignumber.equal(
      neumarkToBurn
    );

    return tx;
  }

  async function unlockEtherWithCallbackUnknownToken(
    investorAddress,
    ticket,
    neumarkToBurn
  ) {
    // ether token is not allowed to call unlock on LockedAccount
    await expect(
      chain.etherToken.approveAndCall(
        chain.lockedAccount.address,
        neumarkToBurn,
        "",
        {
          from: investorAddress
        }
      )
    ).to.be.rejectedWith(EvmError);
  }

  async function expectPenaltyEvent(tx, investorAddress, penalty) {
    const disbursalPool = await chain.lockedAccount.penaltyDisbursalAddress();
    const event = eventValue(tx, "PenaltyDisbursed");
    expect(event).to.exist;
    expect(event.args.investor).to.equal(investorAddress);
    expect(event.args.amount).to.be.bignumber.equal(penalty);
    expect(event.args.toPool).to.equal(disbursalPool);
  }

  /* async function expectLastTransferEvent(tx, from, to, val) {
    const event = eventValue(tx, "Transfer");
    // console.log(event);
    expect(event).to.exist;
    expect(event.args.from).to.equal(from);
    expect(event.args.to).to.equal(to);
    expect(event.args.amount).to.be.bignumber.equal(val);
  } */

  async function expectNeumarksBurnedEvent(tx, owner, euroUlp, neumarkUlp) {
    const event = eventValue(tx, "NeumarksBurned");
    expect(event).to.exist;
    expect(event.args.owner).to.equal(owner);
    expect(event.args.euroUlp).to.be.bignumber.equal(euroUlp);
    expect(event.args.neumarkUlp).to.be.bignumber.equal(neumarkUlp);
  }

  async function expectUnlockEvent(tx, investorAddress, amount) {
    const event = eventValue(tx, "FundsUnlocked");
    expect(event).to.exist;
    expect(event.args.investor).to.equal(investorAddress);
    expect(event.args.amount).to.be.bignumber.equal(amount);
  }

  async function calculateUnlockPenalty(ticket) {
    return ticket
      .mul(await chain.lockedAccount.penaltyFraction())
      .div(chain.ether(1));
  }

  async function assertCorrectUnlock(tx, investorAddress, ticket, penalty) {
    const disbursalPool = await chain.lockedAccount.penaltyDisbursalAddress();
    assert.equal(error(tx), Status.SUCCESS, "Expected OK rc from unlock()");
    // console.log(`unlocked ${eventValue(tx, 'FundsUnlocked', 'amount')} ether`);
    expect(
      await chain.lockedAccount.totalLockedAmount(),
      "all money sent to pool and to investor"
    ).to.be.bignumber.equal(0);
    expect(
      await chain.etherToken.totalSupply(),
      "assetToken should still hold full ticket"
    ).to.be.bignumber.equal(ticket);
    // returns tuple as array
    const investorBalance = await chain.lockedAccount.balanceOf(
      investorAddress
    );
    assert.equal(investorBalance[2], 0, "investor account deleted"); // checked by timestamp == 0
    assert.equal(
      await chain.lockedAccount.totalInvestors(),
      0,
      "should have no investors"
    );
    expect(
      (await chain.etherToken.balanceOf(investorAddress)).plus(
        await chain.etherToken.balanceOf(disbursalPool)
      ),
      "investor + penalty == ticket"
    ).to.be.bignumber.equal(ticket);
    // check penalty value
    expect(
      await chain.etherToken.balanceOf(disbursalPool),
      "fee pool has correct penalty value"
    ).to.be.bignumber.equal(penalty);
    // 0 neumarks at the end
    expect(
      await chain.neumark.balanceOf(investorAddress),
      "all investor neumarks burned"
    ).to.be.bignumber.equal(0);
  }

  async function enableUnlocks() {
    // move time forward within longstop date
    await increaseTime(moment.duration(chain.days, "s"));
    // controller says yes
    await chain.commitment._succ();
    // must enable token transfers
    await chain.neumark.enableTransfer(true);
  }

  async function withdrawAsset(investorAddress, amount) {
    const initalBalance = await web3.eth.getBalance(investorAddress);
    const gasPrice = chain.ether(0.000000001);
    const tx = await chain.etherToken.withdraw(amount, {
      from: investorAddress,
      gasPrice
    });
    const afterBalance = await web3.eth.getBalance(investorAddress);
    const gasCost = gasPrice.mul(tx.receipt.gasUsed);
    expect(afterBalance).to.be.bignumber.eq(
      initalBalance.add(amount).sub(gasCost)
    );
  }

  it("should unlock with approval on contract disbursal", async () => {
    const ticket = chain.ether(1);
    const neumarks = await lockEther(investor, ticket);
    await enableUnlocks();
    const testDisbursal = await TestFeeDistributionPool.new();
    // change disbursal pool
    await chain.lockedAccount.setPenaltyDisbursal(testDisbursal.address, {
      from: admin
    });
    const unlockTx = await unlockEtherWithApprove(investor, ticket, neumarks);
    // check if disbursal pool logged transfer
    const penalty = await calculateUnlockPenalty(ticket);
    await assertCorrectUnlock(unlockTx, investor, ticket, penalty);
    await expectPenaltyEvent(unlockTx, investor, penalty);
    await expectUnlockEvent(unlockTx, investor, ticket.sub(penalty));
    await withdrawAsset(investor, ticket.sub(penalty));
  });

  it("should unlock two investors both with penalty", async () => {
    const ticket1 = chain.ether(1);
    const ticket2 = chain.ether(0.6210939884);
    const neumarks1 = await lockEther(investor, ticket1);
    const neumarks2 = await lockEther(investor2, ticket2);
    await enableUnlocks();
    let unlockTx = await unlockEtherWithApprove(investor, ticket1, neumarks1);
    const penalty1 = await calculateUnlockPenalty(ticket1);
    await expectPenaltyEvent(unlockTx, investor, penalty1);
    await expectUnlockEvent(unlockTx, investor, ticket1.sub(penalty1));
    expect(await chain.neumark.balanceOf(investor2)).to.be.bignumber.eq(
      neumarks2
    );
    expect(await chain.neumark.totalSupply()).to.be.bignumber.eq(neumarks2);
    expect(
      await chain.etherToken.balanceOf(chain.lockedAccount.address)
    ).to.be.bignumber.eq(ticket2);
    expect(await chain.etherToken.totalSupply()).to.be.bignumber.eq(
      ticket1.add(ticket2)
    );

    unlockTx = await unlockEtherWithApprove(investor2, ticket2, neumarks2);
    const penalty2 = await calculateUnlockPenalty(ticket2);
    await expectPenaltyEvent(unlockTx, investor2, penalty2);
    await expectUnlockEvent(unlockTx, investor2, ticket2.sub(penalty2));
  });

  it("should reject unlock with approval on contract disbursal that has receiveApproval not implemented", async () => {
    const ticket = chain.ether(1);
    const neumarks = await lockEther(investor, ticket);
    await enableUnlocks();
    // change disbursal pool to contract without receiveApproval
    const noCallbackContract = await TestNullContract.new();
    await chain.lockedAccount.setPenaltyDisbursal(noCallbackContract.address, {
      from: admin
    });
    const tx = await chain.neumark.approve(
      chain.lockedAccount.address,
      neumarks,
      {
        from: investor
      }
    );
    expect(eventValue(tx, "Approval", "amount")).to.be.bignumber.equal(
      neumarks
    );
    await expect(
      chain.lockedAccount.unlock({ from: investor })
    ).to.be.rejectedWith(EvmError);
  });

  it("should unlock with approval on simple address disbursal", async () => {
    const ticket = chain.ether(1);
    const neumarks = await lockEther(investor, ticket);
    await enableUnlocks();
    const unlockTx = await unlockEtherWithApprove(investor, ticket, neumarks);
    const penalty = await calculateUnlockPenalty(ticket);
    await assertCorrectUnlock(unlockTx, investor, ticket, penalty);
    await expectPenaltyEvent(unlockTx, investor, penalty);
    await expectUnlockEvent(unlockTx, investor, ticket.sub(penalty));
    await withdrawAsset(investor, ticket.sub(penalty));
  });

  it("should unlock with approveAndCall on simple address disbursal", async () => {
    const ticket = chain.ether(1);
    const neumarks = await lockEther(investor, ticket);
    await enableUnlocks();
    const unlockTx = await unlockEtherWithCallback(investor, ticket, neumarks);
    const penalty = await calculateUnlockPenalty(ticket);
    await assertCorrectUnlock(unlockTx, investor, ticket, penalty);
    // truffle will not return events that are not in ABI of called contract so line below uncommented
    // await expectPenaltyEvent(unlockTx, investor, penalty, disbursalPool);
    // look for correct amount of burned neumarks
    await expectNeumarksBurnedEvent(
      unlockTx,
      chain.lockedAccount.address,
      ticket,
      neumarks
    );
    await withdrawAsset(investor, ticket.sub(penalty));
  });

  it("should throw on approveAndCall with unknown token", async () => {
    const ticket = chain.ether(1);
    const neumarks = await lockEther(investor, ticket);
    await enableUnlocks();
    await unlockEtherWithCallbackUnknownToken(investor, ticket, neumarks);
  });

  it("should allow unlock when neumark allowance and balance is too high", async () => {
    const ticket = chain.ether(1);
    const neumarks = await lockEther(investor, ticket);
    const neumarks2 = await lockEther(investor2, ticket);
    await enableUnlocks();
    // simulate trade
    const tradedAmount = neumarks2.mul(0.71389012).round(0);
    await chain.neumark.transfer(investor, tradedAmount, { from: investor2 });
    chain.neumark.approveAndCall(
      chain.lockedAccount.address,
      neumarks.add(tradedAmount),
      "",
      { from: investor }
    );
    // should keep traded amount
    expect(await chain.neumark.balanceOf(investor)).to.be.bignumber.eq(
      tradedAmount
    );
  });

  it("should reject approveAndCall unlock when neumark allowance too low", async () => {
    const ticket = chain.ether(1);
    const neumarks = await lockEther(investor, ticket);
    await enableUnlocks();
    // simulate trade
    const tradedAmount = neumarks.mul(0.71389012).round(0);
    await chain.neumark.transfer(investor2, tradedAmount, { from: investor });
    await expect(
      chain.neumark.approveAndCall(
        chain.lockedAccount.address,
        neumarks.sub(tradedAmount),
        "",
        { from: investor }
      )
    ).to.be.rejectedWith(EvmError);
  });

  it("should reject unlock when neumark balance too low but allowance OK", async () => {
    const ticket = chain.ether(1);
    const neumarks = await lockEther(investor, ticket);
    await enableUnlocks();
    // simulate trade
    const tradedAmount = neumarks.mul(0.71389012).round(0);
    await chain.neumark.transfer(investor2, tradedAmount, { from: investor });
    // allow full amount
    let tx = await chain.neumark.approve(
      chain.lockedAccount.address,
      neumarks,
      { from: investor }
    );
    expect(eventValue(tx, "Approval", "amount")).to.be.bignumber.equal(
      neumarks
    );
    // then try to unlock
    tx = await chain.lockedAccount.unlock({ from: investor });
    assert.equal(error(tx), Status.NOT_ENOUGH_NEUMARKS_TO_UNLOCK);
  });

  it("should unlock after unlock date without penalty", async () => {
    const ticket = chain.ether(1);
    const neumarks = await lockEther(investor, ticket);
    await enableUnlocks();
    const investorBalance = await chain.lockedAccount.balanceOf(investor);
    // forward time to unlock date
    await setTimeTo(investorBalance[2]);
    const unlockTx = await unlockEtherWithApprove(investor, ticket, neumarks);
    await assertCorrectUnlock(unlockTx, investor, ticket, 0);
    await expectUnlockEvent(unlockTx, investor, ticket);
    await withdrawAsset(investor, ticket);
  });

  it("should unlock two investors both without penalty", async () => {
    const ticket1 = chain.ether(4.18781092183);
    const ticket2 = chain.ether(0.46210939884);
    const neumarks1 = await lockEther(investor, ticket1);
    // day later
    await increaseTime(moment.duration(chain.days, "s"));
    const neumarks2 = await lockEther(investor2, ticket2);
    await enableUnlocks();
    // forward to investor1 unlock date
    const investorBalance = await chain.lockedAccount.balanceOf(investor);
    await setTimeTo(investorBalance[2]);
    let unlockTx = await unlockEtherWithApprove(investor, ticket1, neumarks1);
    await expectUnlockEvent(unlockTx, investor, ticket1);
    await withdrawAsset(investor, ticket1);

    const investor2Balance = await chain.lockedAccount.balanceOf(investor2);
    await setTimeTo(investor2Balance[2]);
    unlockTx = await unlockEtherWithApprove(investor2, ticket2, neumarks2);
    await expectUnlockEvent(unlockTx, investor2, ticket2);
    await withdrawAsset(investor2, ticket2);
  });

  it("should unlock two investors one with penalty, second without penalty", async () => {
    const ticket1 = chain.ether(9.18781092183);
    const ticket2 = chain.ether(0.06210939884);
    const neumarks1 = await lockEther(investor, ticket1);
    // day later
    await increaseTime(moment.duration(chain.days, "s"));
    const neumarks2 = await lockEther(investor2, ticket2);
    await enableUnlocks();
    // forward to investor1 unlock date
    const investorBalance = await chain.lockedAccount.balanceOf(investor);
    await setTimeTo(investorBalance[2]);
    let unlockTx = await unlockEtherWithApprove(investor, ticket1, neumarks1);
    await expectUnlockEvent(unlockTx, investor, ticket1);
    await withdrawAsset(investor, ticket1);

    const investor2Balance = await chain.lockedAccount.balanceOf(investor2);
    // 10 seconds before unlock date should produce penalty
    await setTimeTo(investor2Balance[2] - 10);
    unlockTx = await unlockEtherWithApprove(investor2, ticket2, neumarks2);
    const penalty2 = await calculateUnlockPenalty(ticket2);
    await expectPenaltyEvent(unlockTx, investor2, penalty2);
    await expectUnlockEvent(unlockTx, investor2, ticket2.sub(penalty2));
    await withdrawAsset(investor2, ticket2.sub(penalty2));
  });

  it("should unlock without burning neumarks on release all", async () => {
    const ticket1 = chain.ether(9.18781092183);
    const ticket2 = chain.ether(0.06210939884);
    const neumarks1 = await lockEther(investor, ticket1);
    // day later
    await increaseTime(moment.duration(chain.days, "s"));
    const neumarks2 = await lockEther(investor2, ticket2);
    await increaseTime(moment.duration(chain.days, "s"));
    // controller says no
    await chain.commitment._fail();
    // forward to investor1 unlock date
    let unlockTx = await chain.lockedAccount.unlock({ from: investor });
    await expectUnlockEvent(unlockTx, investor, ticket1);
    // keeps neumarks
    expect(await chain.neumark.balanceOf(investor)).to.be.bignumber.eq(
      neumarks1
    );
    await withdrawAsset(investor, ticket1);

    unlockTx = await chain.lockedAccount.unlock({ from: investor2 });
    await expectUnlockEvent(unlockTx, investor2, ticket2);
    // keeps neumarks
    expect(await chain.neumark.balanceOf(investor2)).to.be.bignumber.eq(
      neumarks2
    );
    await withdrawAsset(investor2, ticket2);
  });

  async function allowToReclaim(account) {
    await chain.accessControl.setUserRole(
      account,
      await chain.accessRoles.ROLE_RECLAIMER(),
      chain.lockedAccount.address,
      TriState.Allow
    );
  }

  it("should reject unlock if disbursal pool is not set");

  it("should reclaim assetToken amount above totalLockedAmount", async () => {
    const ticket1 = chain.ether(9.18781092183);
    await lockEther(investor, ticket1);
    // send etherToken to locked account
    const shouldBeReclaimedDeposit = chain.ether(0.028319821);
    await chain.etherToken.deposit(investor2, shouldBeReclaimedDeposit, {
      from: investor2,
      value: shouldBeReclaimedDeposit
    });
    await chain.etherToken.transfer(
      chain.lockedAccount.address,
      shouldBeReclaimedDeposit,
      { from: investor2 }
    );
    // should reclaim
    await allowToReclaim(admin);
    await chain.lockedAccount.reclaim(chain.etherToken.address, {
      from: admin
    });
    expect(await chain.etherToken.balanceOf(admin)).to.be.bignumber.eq(
      shouldBeReclaimedDeposit
    );
    // should change nothing
    await chain.lockedAccount.reclaim(chain.etherToken.address, {
      from: admin
    });
    expect(await chain.etherToken.balanceOf(admin)).to.be.bignumber.eq(
      shouldBeReclaimedDeposit
    );
  });

  it("should reclaim neumarks", async () => {
    const ticket1 = chain.ether(9.18781092183);
    const neumarks1 = await lockEther(investor, ticket1);
    await enableUnlocks();
    await chain.neumark.transfer(chain.lockedAccount.address, neumarks1, {
      from: investor
    });
    await allowToReclaim(admin);
    await chain.lockedAccount.reclaim(chain.neumark.address, { from: admin });
    expect(await chain.neumark.balanceOf(admin)).to.be.bignumber.eq(neumarks1);
  });

  it("should reclaim ether", async () => {
    const amount = chain.ether(1);
    await forceEther(chain.lockedAccount.address, amount, investor);
    const reclaimEther = await chain.lockedAccount.RECLAIM_ETHER();
    await allowToReclaim(admin);
    const adminEthBalance = await web3.eth.getBalance(admin);
    const gasPrice = chain.ether(0.000000001);
    const tx = await chain.lockedAccount.reclaim(reclaimEther, {
      from: admin,
      gasPrice
    });
    const gasCost = gasPrice.mul(tx.receipt.gasUsed);
    const adminEthAfterBalance = await web3.eth.getBalance(admin);
    expect(adminEthAfterBalance).to.be.bignumber.eq(
      adminEthBalance.add(amount).sub(gasCost)
    );
  });

  it("should reject setController when previous controller not finalized", async () => {
    const ticket1 = chain.ether(9.18781092183);
    await lockEther(investor, ticket1);
    const controllerAddr = await chain.lockedAccount.controller();
    const tokenController = TestCommitment.at(controllerAddr);
    expect(await tokenController.isFinalized()).to.be.false;
    const nullContract = await TestNullContract.new();
    await expect(
      chain.lockedAccount.setController(nullContract.address, { from: admin })
    ).to.be.rejectedWith(EvmError);
  });

  it("should accept setController when previous controller finalized", async () => {
    const ticket1 = chain.ether(9.18781092183);
    await lockEther(investor, ticket1);
    // finalizes controller
    await chain.commitment._succWithLockRelease();
    const controllerAddr = await chain.lockedAccount.controller();
    const tokenController = TestCommitment.at(controllerAddr);
    expect(await tokenController.isFinalized()).to.be.true;
    const nullContract = await TestNullContract.new();
    await chain.lockedAccount.setController(nullContract.address, {
      from: admin
    });
  });

  function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
  }

  describe("should reject on invalid state", () => {
    const PublicFunctionsRejectInState = {
      lock: [
        LockState.Uncontrolled,
        LockState.AcceptingUnlocks,
        LockState.ReleaseAll
      ],
      unlock: [LockState.Uncontrolled, LockState.AcceptingLocks],
      receiveApproval: [LockState.Uncontrolled, LockState.AcceptingLocks],
      controllerFailed: [
        LockState.Uncontrolled,
        LockState.AcceptingUnlocks,
        LockState.ReleaseAll
      ],
      controllerSucceeded: [
        LockState.Uncontrolled,
        LockState.AcceptingUnlocks,
        LockState.ReleaseAll
      ],
      enableMigration: [LockState.Uncontrolled],
      setController: [
        LockState.Uncontrolled,
        LockState.AcceptingUnlocks,
        LockState.ReleaseAll
      ],
      setPenaltyDisbursal: [],
      reclaim: []
    };

    Object.keys(PublicFunctionsRejectInState).forEach(name => {
      PublicFunctionsRejectInState[name].forEach(state => {
        it(`when ${name} in ${getKeyByValue(LockState, state)}`);
      });
    });
  });

  describe("should reject on non admin access to", () => {
    const PublicFunctionsAdminOnly = [
      "enableMigration",
      "setController",
      "setPenaltyDisbursal"
    ];
    PublicFunctionsAdminOnly.forEach(name => {
      it(`${name}`);
    });
  });

  describe("should reject access from not a controller to", () => {
    const PublicFunctionsControllerOnly = [
      "lock",
      "controllerFailed",
      "controllerSucceeded"
    ];
    PublicFunctionsControllerOnly.forEach(name => {
      it(`${name}`);
    });
  });
});
