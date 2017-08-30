import { expect } from "chai";
import moment from "moment";
import error, { Status } from "./helpers/error";
import { eventValue } from "./helpers/events";
import * as chain from "./helpers/spawnContracts";
import increaseTime, { setTimeTo } from "./helpers/increaseTime";
import latestTime, { latestTimestamp } from "./helpers/latestTime";
import EvmError from "./helpers/EVMThrow";
import createAccessPolicy from "./helpers/createAccessPolicy";
import { TriState } from "./helpers/triState";
import forceEther from "./helpers/forceEther";


contract("EtherToken", async ([_, reclaimer, investor1, investor2]) => {

  beforeEach(async () => {
    await chain.spawnEtherToken();
  });

  async function allowToReclaim(account) {
    await chain.accessControl.setUserRole(
      account,
      await chain.accessRoles.ROLE_RECLAIMER(),
      chain.etherToken.address,
      TriState.Allow
    );
  }

  it("should reclaim ether above etherToken supply", async () => {
    const deposit = chain.ether(0.0192831982);
    await chain.etherToken.deposit(investor2, deposit, {from: investor2, value: deposit});
    const amount = chain.ether(1);
    await forceEther(chain.etherToken.address, amount, investor1);
    const reclaim_ether = await chain.etherToken.RECLAIM_ETHER();
    await allowToReclaim(reclaimer);
    const reclaimerEthBalance = await web3.eth.getBalance(reclaimer);
    const gasPrice = chain.ether(0.000000001);
    const tx = await chain.etherToken.reclaim(reclaim_ether, { from: reclaimer, gasPrice: gasPrice });
    const gasCost = gasPrice.mul(tx.receipt.gasUsed);
    const reclaimerEthAfterBalance = await web3.eth.getBalance(reclaimer);
    // only amount is reclaimed
    expect(reclaimerEthAfterBalance).to.be.bignumber.eq(reclaimerEthBalance.add(amount).sub(gasCost));
    // deposit stays
    expect(await web3.eth.getBalance(chain.etherToken.address)).to.be.bignumber.eq(deposit);
    // nothing changed by further reclaims
    await chain.etherToken.reclaim(reclaim_ether, { from: reclaimer, gasPrice: gasPrice });
    expect(await web3.eth.getBalance(chain.etherToken.address)).to.be.bignumber.eq(deposit);
  });

  it("should be able to reclaim etherToken balance on itself", async () => {
    const deposit = chain.ether(0.0192831982);
    await chain.etherToken.deposit(investor2, deposit, {from: investor2, value: deposit});
    const toReclaim = chain.ether(0.00129389182);
    // sends tokens to etherToken address
    await chain.etherToken.transfer(chain.etherToken.address, toReclaim, {from: investor2});
    await allowToReclaim(reclaimer);
    // reclaim from itself
    const tx = await chain.etherToken.reclaim(chain.etherToken.address,
      { from: reclaimer });
    // only toReclaim is reclaimed
    expect(await chain.etherToken.balanceOf(reclaimer))
      .to.be.bignumber.eq(toReclaim);
  });
});
