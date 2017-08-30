import { expect } from "chai";
import * as chain from "./helpers/spawnContracts";
import { eventValue } from "./helpers/events";
import { setTimeTo } from "./helpers/increaseTime";
import { latestTimestamp } from "./helpers/latestTime";

contract("PublicCommitment", ([lockAdmin, investor]) => {
  let startTimestamp;
  const commitmentDuration = chain.months;

  beforeEach(async () => {
    await chain.spawnLockedAccount(lockAdmin, 18, 0.1);
    // achtung! latestTimestamp() must be called after a block is mined, before that time is not accurrate
    startTimestamp = latestTimestamp() + chain.days;
    // apply time limit to ICO
    await chain.spawnPublicCommitment(
      lockAdmin,
      startTimestamp,
      commitmentDuration,
      chain.ether(1),
      chain.ether(2000),
      chain.ether(1),
      218.1192809
    );
  });

  it("should be able to read Commitment parameters", async () => {
    assert.equal(
      await chain.commitment.startDate.call(),
      startTimestamp,
      "startDate"
    );
    assert.equal(
      await chain.commitment.paymentToken.call(),
      chain.etherToken.address
    );
    assert.equal(
      await chain.commitment.lockedAccount.call(),
      chain.lockedAccount.address
    );
    assert.equal(await chain.commitment.neumark.call(), chain.neumark.address);
    expect(await chain.commitment.minAbsCap()).to.be.bignumber.equal(
      chain.ether(1)
    );
    // caps must be zero before investment
    expect(await chain.commitment.maxAbsCap()).to.be.bignumber.equal(
      chain.ether(2000)
    );
  });

  it("commit before startDate");
  it("commit on startDate");
  it("commit after startDate"); // few cases of ETH->EUR->Neumark using PublicCommitment and independent check of values
  it("should emit FundsInvested event");
  it("should emit CommitmentCompleted event");

  it("should complete Commitment with failed state without any investors", async () => {
    await setTimeTo(startTimestamp); // commitment starts
    assert.equal(
      await chain.lockedAccount.lockState.call(),
      1,
      "lock should be in AcceptingLocks"
    );
    await setTimeTo(startTimestamp + chain.days); // day forward
    assert.equal(
      await chain.commitment.hasEnded.call(),
      false,
      "commitment should run"
    );
    // make commitment finish due to end date
    await setTimeTo(startTimestamp + commitmentDuration); // day forward
    assert.equal(
      await chain.commitment.hasEnded.call(),
      true,
      "commitment should end"
    );
    assert.equal(
      await chain.commitment.wasSuccessful.call(),
      false,
      "commitment should fail"
    );
    // now finalize
    await chain.commitment.finalize();
    assert.equal(
      await chain.commitment.isFinalized(),
      true,
      "should be finalized"
    );
    // check lock state
    assert.equal(
      await chain.lockedAccount.lockState.call(),
      3,
      "lock should be in ReleaseAll"
    );
  });

  it("should commit 1 ether", async () => {
    const ticket = 1 * 10 ** 18;
    expect(await chain.neumark.totalSupply()).to.be.bignumber.equal(0);
    await setTimeTo(startTimestamp); // commitment starts
    assert.equal(
      await chain.commitment.hasEnded.call(),
      false,
      "commitment should run"
    );
    const tx = await chain.commitment.commit({ value: ticket, from: investor });
    // check event
    const event = eventValue(tx, "FundsInvested");
    expect(event).to.exist;
    expect(event.args.amount).to.be.bignumber.equal(ticket);
    // check balances
    expect(
      await chain.lockedAccount.totalLockedAmount(),
      "lockedAccount balance must match ticket"
    ).to.be.bignumber.equal(ticket);
    assert.equal(await chain.lockedAccount.totalInvestors(), 1);
    expect(
      await await chain.etherToken.totalSupply(),
      "ticket must be in etherToken"
    ).to.be.bignumber.equal(ticket);
    const lockBalance = await chain.etherToken.balanceOf(
      chain.lockedAccount.address
    );
    expect(
      lockBalance,
      "balance of lock contract must equal ticket"
    ).to.be.bignumber.equal(ticket);
    const investorBalance = await chain.lockedAccount.balanceOf(investor);
    const neumarkBalance = await chain.neumark.balanceOf.call(investor);
    // console.log(`investor ${investorBalance[1].valueOf()} total nmk ${neumarkBalance.valueOf()}`)
    expect(
      investorBalance[1],
      "neumarks due in lock must equal balance in token contract"
    ).to.be.bignumber.equal(neumarkBalance.valueOf());
    // fifth force and investor's neumarks should be same (half half split)
    const operatorBalance = await chain.neumark.balanceOf(chain.operatorWallet);
    // console.log(`${chain.operatorWallet} has ${operatorBalance}`);
    const supply = await chain.neumark.totalSupply();
    expect(supply, "lock and operator have all neumarks").to.be.bignumber.equal(
      operatorBalance.plus(investorBalance[1])
    );
    // allow for 1 wei difference
    expect(
      operatorBalance.minus(investorBalance[1]).abs(),
      "half half split"
    ).to.be.bignumber.below(2);
  });

  it("commitment should succeed due to cap reached", async () => {
    const ticket = 2 * 10 ** 18;
    await setTimeTo(startTimestamp); // commitment starts
    assert.equal(
      await chain.commitment.hasEnded.call(),
      false,
      "commitment should run"
    );
    await chain.commitment.commit({ value: ticket, from: investor });
    // decrease max cap so it is exactly ticket
    await setTimeTo(startTimestamp + chain.days); // day forward
    await chain.commitment._changeMaxCap(ticket);
    assert.equal(
      await chain.commitment.hasEnded.call(),
      true,
      "commitment should end"
    );
    assert.equal(
      await chain.commitment.wasSuccessful.call(),
      true,
      "commitment should succeed - min cap reached"
    );
    // now finalize
    await chain.commitment.finalize();
    // check lock state
    assert.equal(
      await chain.lockedAccount.lockState.call(),
      2,
      "lock should be in AcceptingUnlocks"
    );
    // check if neumarks transferable
    assert.equal(
      await chain.neumark.transferEnabled(),
      true,
      "neumark transfers should be enabled"
    );
  });

  // few cases of ETH->EUR->Neumark using PublicCommitment and independent check of values
  it("converts to EUR correctly and issues Neumark");
  it("should commit minimum ticket");
  it("should reject below minimum ticket");
  // escape hatch is used after Commitment is finalized
  // this will lower the amount so in theory if C was finished due to cap it may become active again!
  // checking finalize will prevent it
  it("fails to re-activate Commitment by escape hatch");
  it("fails to make Commitment unsuccessful by escape hatch");
  it("commitment should succeed due to endDate reached");
  it("first ticket should commit max cap");
  it("should commit large ticket ether 100000000000000");
  it("should reject commitment larger than remaining cap");
  it("send ether to default func should fail");
  it("implement all cases from zeppeling Crowdsale.js and CappedCrowdsale.js");
  it("should reject commit before terms are set");
  it("should reject commit if not controlling locked account");
});
