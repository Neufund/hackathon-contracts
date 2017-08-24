import { expect } from "chai";
import gasCost from "./helpers/gasCost";
import eventValue from "./helpers/eventValue";

const Curve = artifacts.require("./Curve.sol");
const CurveGas = artifacts.require("./test/CurveGas.sol");
const NeumarkFactory = artifacts.require("./NeumarkFactory.sol");
const Neumark = artifacts.require("./Neumark.sol");
const NeumarkController = artifacts.require("./NeumarkController.sol");

contract("Curve", accounts => {
  let curve;
  let curveGas;
  let neumark;
  let factory;
  let controller;
  let EUR_DECIMALS;
  let NMK_DECIMALS;

  beforeEach(async () => {
    EUR_DECIMALS = new BigNumber(10).toPower(18);
    NMK_DECIMALS = new BigNumber(10).toPower(18);

    factory = await NeumarkFactory.new();
    neumark = await Neumark.new(factory.address);
    controller = await NeumarkController.new(neumark.address);
    await neumark.changeController(controller.address);
    curve = await Curve.new(controller.address);
    curveGas = await CurveGas.new(controller.address);
  });

  it("should deploy", async () => {
    console.log(`\tCurve took ${gasCost(curve)}.`);
  });

  it("should start at zero", async () => {
    assert.equal(await curve.totalEuroUlps.call(), 0);
  });

  it("should compute exactly over the whole range", async () => {
    const correct = [
      [0, 0],
      [1, 6],
      [2, 12],
      [3, 19],
      [4, 25],
      [5, 32],
      [6, 38],
      [7, 45],
      [8, 51],
      [9, 58],
      [10, 64],
      [20, 129],
      [30, 194],
      [40, 259],
      [50, 324],
      [60, 389],
      [70, 454],
      [80, 519],
      [90, 584],
      [100, 649],
      [200, 1299],
      [300, 1949],
      [400, 2599],
      [500, 3249],
      [600, 3899],
      [700, 4549],
      [800, 5199],
      [900, 5849],
      [1000, 6499],
      [2000, 12999],
      [3000, 19499],
      [4000, 25999],
      [5000, 32499],
      [6000, 38999],
      [7000, 45499],
      [8000, 51999],
      [9000, 58498],
      [10000, 64998],
      [20000, 129994],
      [30000, 194987],
      [40000, 259977],
      [50000, 324964],
      [60000, 389949],
      [70000, 454930],
      [80000, 519909],
      [90000, 584885],
      [100000, 649859],
      [200000, 1299436],
      [300000, 1948733],
      [400000, 2597747],
      [500000, 3246481],
      [600000, 3894934],
      [700000, 4543106],
      [800000, 5190997],
      [900000, 5838607],
      [1000000, 6485936],
      [2000000, 12943829],
      [3000000, 19373797],
      [4000000, 25775962],
      [5000000, 32150445],
      [6000000, 38497365],
      [7000000, 44816841],
      [8000000, 51108992],
      [9000000, 57373936],
      [10000000, 63611790],
      [20000000, 124525941],
      [30000000, 182856853],
      [40000000, 238714076],
      [50000000, 292202513],
      [60000000, 343422621],
      [70000000, 392470593],
      [80000000, 439438546],
      [90000000, 484414688],
      [100000000, 527483488],
      [200000000, 869474423],
      [300000000, 1091202310],
      [400000000, 1234958331],
      [500000000, 1328161734],
      [600000000, 1388589632],
      [700000000, 1427767718],
      [800000000, 1453168609],
      [900000000, 1469637132],
      [1000000000, 1480314406],
      [1100000000, 1487236957],
      [1200000000, 1491725153],
      [1300000000, 1494635050],
      [1400000000, 1496521665],
      [1500000000, 1497744841],
      [1600000000, 1498537880],
      [1700000000, 1499052043],
      [1800000000, 1499385397],
      [1900000000, 1499601525],
      [2000000000, 1499741651],
      [3000000000, 1499996609],
      [4000000000, 1499999955],
      [5000000000, 1499999999],
      [6000000000, 1499999999],
      [7000000000, 1499999999],
      [8000000000, 1499999999],
      [8299999999, 1499999999],
      [8300000000, 1500000000],
      [9000000000, 1500000000],
      [10000000000, 1500000000],
      [20000000000, 1500000000],
      [30000000000, 1500000000],
      [40000000000, 1500000000],
      [50000000000, 1500000000],
      [60000000000, 1500000000],
      [70000000000, 1500000000],
      [80000000000, 1500000000],
      [90000000000, 1500000000],
    ];
    const gas = await Promise.all(
      correct.map(async ([i, v]) => {
        const [neumarkUlps, gas] = await curveGas.curveGas.call(EUR_DECIMALS.mul(i));
        const neumarks = 0 | neumarkUlps.div(NMK_DECIMALS).floor().valueOf();
        assert.equal(neumarks, v, `Curve compute failed for value ${i}`);
        return [i, 0 | gas.valueOf()];
      })
    );
    const totalGas = gas.reduce((t, [_, gas]) => t + gas, 0);
    console.log(`\t${correct.length} evaluations took ${gasCost(totalGas)}.`);
  });

  it("should issue Neumarks", async () => {
    assert.equal((await curve.totalEuroUlps.call()).valueOf(), 0);
    assert.equal((await neumark.totalSupply.call()).valueOf(), 0);

    const r1 = await curve.issue(EUR_DECIMALS.mul(100), { from: accounts[1] }); // TODO check result
    console.log(`\tIssue took ${gasCost(r1)}.`);
    assert.equal((await curve.totalEuroUlps.call()).div(NMK_DECIMALS).floor().valueOf(), 100);
    assert.equal((await neumark.totalSupply.call()).div(NMK_DECIMALS).floor().valueOf(), 649);
    assert.equal(
      (await neumark.balanceOf.call(accounts[1])).div(NMK_DECIMALS).floor().valueOf(),
      649
    );

    const r2 = await curve.issue(EUR_DECIMALS.mul(900), { from: accounts[2] });
    console.log(`\tIssue took ${gasCost(r2)}.`);
    assert.equal((await curve.totalEuroUlps.call()).div(NMK_DECIMALS).floor().valueOf(), 1000);
    assert.equal((await neumark.totalSupply.call()).div(NMK_DECIMALS).floor().valueOf(), 6499);
    assert.equal(
      (await neumark.balanceOf.call(accounts[2])).div(NMK_DECIMALS).floor().valueOf(),
      5849
    );
  });

  it("should issue and then burn Neumarks", async () => {
    // Issue Neumarks for 1 mln Euros
    const euroUlps = EUR_DECIMALS.mul(1000000);
    const r = await curve.issue(euroUlps, { from: accounts[1] });
    console.log(`\tIssue took ${gasCost(r)}.`);
    const neumarkUlps = await neumark.balanceOf.call(accounts[1]);
    const neumarks = neumarkUlps.div(NMK_DECIMALS).floor().valueOf();

    // Burn a third the Neumarks
    const toBurn = Math.floor(neumarks / 3);
    const toBurnUlps = NMK_DECIMALS.mul(toBurn);
    const burned = await curve.burnNeumark(toBurnUlps, { from: accounts[1] });
    console.log(`\tBurn took ${gasCost(burned)}.`);
    assert.equal(
      (await neumark.balanceOf.call(accounts[1])).div(NMK_DECIMALS).floor().valueOf(),
      neumarks - toBurn
    );
  });

  it("should issue same amount in multiple issuances", async () => {
    // 1 ether + 100 wei in eur
    const eurRate = 218.1192809;
    const euroUlps = EUR_DECIMALS.mul(1).add(100).mul(eurRate);
    const totNMK = await curve.cumulative(euroUlps);
    // issue for 1 ether
    const euro1EthUlps = EUR_DECIMALS.mul(1).mul(eurRate);
    let tx = await curve.issue(euro1EthUlps);
    const p1NMK = eventValue(tx, "NeumarksIssued", "neumarks");
    // issue for 100 wei
    tx = await curve.issue(new BigNumber(100).mul(eurRate));
    const p2NMK = eventValue(tx, "NeumarksIssued", "neumarks");

    expect(totNMK).to.be.bignumber.equal(p1NMK.plus(p2NMK));
  });
});
