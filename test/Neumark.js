import { expect } from "chai";
import { prettyPrintGasCost } from "./helpers/gasUtils";
import { eventValue } from "./helpers/events";
import { TriState } from "./helpers/triState";

const RoleBasedAccessControl = artifacts.require(
  "./AccessControl/RoleBasedAccessControl.sol"
);
const AccessRoles = artifacts.require("./AccessRoles");
const Neumark = artifacts.require("./Neumark.sol");

const BigNumber = web3.BigNumber;
const EUR_DECIMALS = new BigNumber(10).toPower(18);
const NMK_DECIMALS = new BigNumber(10).toPower(18);

contract("Neumark", accounts => {
  let rbac;
  let neumark;

  beforeEach(async () => {
    rbac = await RoleBasedAccessControl.new();
    neumark = await Neumark.new(rbac.address);
    const roles = await AccessRoles.new();
    await rbac.setUserRole(
      accounts[0],
      await roles.ROLE_NEUMARK_ISSUER(),
      neumark.address,
      TriState.Allow
    );
    await rbac.setUserRole(
      accounts[1],
      await roles.ROLE_NEUMARK_ISSUER(),
      neumark.address,
      TriState.Allow
    );
    await rbac.setUserRole(
      accounts[2],
      await roles.ROLE_NEUMARK_ISSUER(),
      neumark.address,
      TriState.Allow
    );
    await rbac.setUserRole(
      accounts[0],
      await roles.ROLE_NEUMARK_BURNER(),
      neumark.address,
      TriState.Allow
    );
    await rbac.setUserRole(
      accounts[1],
      await roles.ROLE_NEUMARK_BURNER(),
      neumark.address,
      TriState.Allow
    );
  });

  it("should deploy", async () => {
    prettyPrintGasCost("Neumark deploy", neumark);
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
});
