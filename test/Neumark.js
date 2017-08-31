import { expect } from "chai";
import { prettyPrintGasCost } from "./helpers/gasUtils";
import { eventValue } from "./helpers/events";
import createAccessPolicy from "./helpers/createAccessPolicy";
import roles from "./helpers/roles";

const EthereumForkArbiter = artifacts.require("EthereumForkArbiter");
const Neumark = artifacts.require("./Neumark.sol");

const BigNumber = web3.BigNumber;
const EUR_DECIMALS = new BigNumber(10).toPower(18);
const NMK_DECIMALS = new BigNumber(10).toPower(18);

contract("Neumark", accounts => {
  const agreementUri = "ipfs:QmPXME1oRtoT627YKaDPDQ3PwA8tdP9rWuAAweLzqSwAWT";
  let rbac;
  let forkArbiter;
  let neumark;

  beforeEach(async () => {
    rbac = await createAccessPolicy([
      { role: roles.neumarkTrader },
      { subject: accounts[0], role: roles.neumarkIssuer },
      { subject: accounts[1], role: roles.neumarkIssuer },
      { subject: accounts[2], role: roles.neumarkIssuer },
      { subject: accounts[0], role: roles.neumarkBurner },
      { subject: accounts[1], role: roles.neumarkBurner }
    ]);
    forkArbiter = await EthereumForkArbiter.new(rbac);
    neumark = await Neumark.new(rbac, forkArbiter.address, agreementUri);
  });

  it("should deploy", async () => {
    prettyPrintGasCost("Neumark deploy", neumark);
  });

  it("should have agreement and fork arbiter", async () => {
    const actualAgreement = await neumark.agreementUri.call();
    const actualForkArbiter = await neumark.ethereumForkArbiter.call();

    expect(actualAgreement).to.equal(agreementUri);
    expect(actualForkArbiter).to.equal(forkArbiter.address);
  });

  it("should have name Neumark, symbol NMK and 18 decimals", async () => {
    assert.equal(await neumark.name.call(), "Neumark");
    assert.equal(await neumark.symbol.call(), "NMK");
    assert.equal(await neumark.decimals.call(), 18);
  });

  it("should start at zero", async () => {
    assert.equal(await neumark.totalSupply.call(), 0);
    assert.equal(await neumark.balanceOf.call(accounts[0]), 0);
  });

  it("should issue Neumarks", async () => {
    assert.equal((await neumark.totalEuroUlps.call()).valueOf(), 0);
    assert.equal((await neumark.totalSupply.call()).valueOf(), 0);

    const r1 = await neumark.issueForEuro(EUR_DECIMALS.mul(100), {
      from: accounts[1]
    }); // TODO check result
    prettyPrintGasCost("Issue", r1);
    assert.equal(
      (await neumark.totalEuroUlps.call()).div(NMK_DECIMALS).floor().valueOf(),
      100
    );
    assert.equal(
      (await neumark.totalSupply.call()).div(NMK_DECIMALS).floor().valueOf(),
      649
    );
    assert.equal(
      (await neumark.balanceOf.call(accounts[1]))
        .div(NMK_DECIMALS)
        .floor()
        .valueOf(),
      649
    );

    const r2 = await neumark.issueForEuro(EUR_DECIMALS.mul(900), {
      from: accounts[2]
    });
    prettyPrintGasCost("Issue", r2);
    assert.equal(
      (await neumark.totalEuroUlps.call()).div(NMK_DECIMALS).floor().valueOf(),
      1000
    );
    assert.equal(
      (await neumark.totalSupply.call()).div(NMK_DECIMALS).floor().valueOf(),
      6499
    );
    assert.equal(
      (await neumark.balanceOf.call(accounts[2]))
        .div(NMK_DECIMALS)
        .floor()
        .valueOf(),
      5849
    );
  });

  it("should accept agreement on issue", async () => {
    const from = accounts[1];

    const tx = await neumark.issueForEuro(EUR_DECIMALS.mul(100), { from });

    const agreements = tx.logs
      .filter(e => e.event === "AgreementAccepted")
      .map(({ args: { accepter } }) => accepter);
    expect(agreements).to.have.length(1);
    expect(agreements).to.contain(from);
  });

  it("should issue and then burn Neumarks", async () => {
    // Issue Neumarks for 1 mln Euros
    const euroUlps = EUR_DECIMALS.mul(1000000);
    const r = await neumark.issueForEuro(euroUlps, { from: accounts[1] });
    prettyPrintGasCost("Issue", r);
    const neumarkUlps = await neumark.balanceOf.call(accounts[1]);
    const neumarks = neumarkUlps.div(NMK_DECIMALS).floor().valueOf();

    // Burn a third the Neumarks
    const toBurn = Math.floor(neumarks / 3);
    const toBurnUlps = NMK_DECIMALS.mul(toBurn);
    const burned = await neumark.burnNeumark(toBurnUlps, { from: accounts[1] });
    prettyPrintGasCost("Burn", burned);
    assert.equal(
      (await neumark.balanceOf.call(accounts[1]))
        .div(NMK_DECIMALS)
        .floor()
        .valueOf(),
      neumarks - toBurn
    );
  });

  it("should accept agreement on burn", async () => {
    const from = accounts[1];
    await neumark.issueForEuro(EUR_DECIMALS.mul(100), { from });
    const toBurnUlps = await neumark.balanceOf.call(from);

    const tx = await neumark.burnNeumark(toBurnUlps, { from: accounts[1] });

    const agreements = tx.logs
      .filter(e => e.event === "AgreementAccepted")
      .map(({ args: { accepter } }) => accepter);
    expect(agreements).to.have.length(1);
    expect(agreements).to.contain(from);
  });

  it("should issue same amount in multiple issuances", async () => {
    // 1 ether + 100 wei in eur
    const eurRate = 218.1192809;
    const euroUlps = EUR_DECIMALS.mul(1).add(100).mul(eurRate);
    const totNMK = await neumark.cumulative(euroUlps);
    // issue for 1 ether
    const euro1EthUlps = EUR_DECIMALS.mul(1).mul(eurRate);
    let tx = await neumark.issueForEuro(euro1EthUlps);
    const p1NMK = eventValue(tx, "NeumarksIssued", "neumarkUlp");
    // issue for 100 wei
    tx = await neumark.issueForEuro(new BigNumber(100).mul(eurRate));
    const p2NMK = eventValue(tx, "NeumarksIssued", "neumarkUlp");
    expect(totNMK).to.be.bignumber.equal(p1NMK.plus(p2NMK));
  });

  it("should transfer Neumarks", async () => {
    const from = accounts[1];
    await neumark.issueForEuro(EUR_DECIMALS.mul(100), { from });
    const amount = await neumark.balanceOf.call(accounts[1]);
    await neumark.enableTransfer(true);

    const tx = await neumark.transfer(accounts[3], amount, { from });
    const balance1 = await neumark.balanceOf.call(accounts[1]);
    const balance3 = await neumark.balanceOf.call(accounts[3]);

    prettyPrintGasCost("Transfer", tx);
    expect(amount).to.be.bignumber.not.equal(0);
    expect(balance1).to.be.bignumber.equal(0);
    expect(balance3).to.be.bignumber.equal(amount);
  });

  it("should accept agreement on transfer", async () => {
    const from = accounts[1];
    await neumark.issueForEuro(EUR_DECIMALS.mul(100), { from });
    const amount = await neumark.balanceOf.call(accounts[1]);
    await neumark.enableTransfer(true);

    const tx = await neumark.transfer(accounts[3], amount, { from });

    const agreements = tx.logs
      .filter(e => e.event === "AgreementAccepted")
      .map(({ args: { accepter } }) => accepter);
    expect(agreements).to.have.length(2);
    expect(agreements).to.contain(accounts[1]);
    expect(agreements).to.contain(accounts[3]);
  });

  it("should transfer Neumarks only when enabled", async () => {
    const from = accounts[1];
    await neumark.issueForEuro(EUR_DECIMALS.mul(100), { from });
    const amount = await neumark.balanceOf.call(accounts[1]);
    await neumark.enableTransfer(false);

    const tx = neumark.transfer(accounts[3], amount, { from });

    await expect(tx).to.revert;
  });
});
