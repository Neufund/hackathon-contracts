import { expect } from "chai";
import moment from "moment";
import { prettyPrintGasCost } from "./helpers/gasUtils";
import { latestTimestamp } from "./helpers/latestTime";
import increaseTime from "./helpers/increaseTime";

const SnapshotTest = artifacts.require("./test/SnapshotTest.sol");

const day = 24 * 3600;

contract("Snapshot", () => {
  let snapshotTest;

  const createSnapshot = async () => {
    const r = await snapshotTest.createSnapshot();
    assert.equal(r.logs.length, 1);
    assert.equal(r.logs[0].event, "SnapshotCreated");
    return r.logs[0].args.snapshot;
  };

  beforeEach(async () => {
    snapshotTest = await SnapshotTest.new();
  });

  it("should deploy", async () => {
    prettyPrintGasCost("createSnapshot", snapshotTest);
  });

  it("should be initially unset", async () => {
    assert.isFalse(await snapshotTest.hasValue.call());
  });

  it("should initially return default", async () => {
    assert.isFalse(await snapshotTest.hasValue.call());
  });

  it("should initially return default", async () => {
    assert.equal(12, await snapshotTest.getValue.call(12));
    assert.equal(42, await snapshotTest.getValue.call(42));
  });

  it("should create a snapshot", async () => {
    const r = await snapshotTest.createSnapshot();
    prettyPrintGasCost("createSnapshot", r);
  });

  it("should set a new value", async () => {
    const r = await snapshotTest.setValue(1234);

    prettyPrintGasCost("Setting new value should of ", r);

    assert.equal(1234, await snapshotTest.getValue.call(12));
    assert.isTrue(await snapshotTest.hasValue.call());
  });

  it("should reset value", async () => {
    await snapshotTest.setValue(1234);

    const r = await snapshotTest.setValue(12345);
    prettyPrintGasCost("Resetting new value", r);

    assert.equal(12345, await snapshotTest.getValue.call(12));
    assert.isTrue(await snapshotTest.hasValue.call());
  });

  it("should keep values in snapshots", async () => {
    const before = await createSnapshot();
    await snapshotTest.setValue(100);
    const middle = await createSnapshot();
    await snapshotTest.setValue(200);
    const after = await createSnapshot();

    assert.isFalse(await snapshotTest.hasValueAt.call(before));
    assert.isTrue(await snapshotTest.hasValueAt.call(middle));
    assert.isTrue(await snapshotTest.hasValueAt.call(after));
    assert.equal(41, await snapshotTest.getValueAt.call(before, 41));
    assert.equal(100, await snapshotTest.getValueAt.call(middle, 41));
    assert.equal(200, await snapshotTest.getValueAt.call(after, 41));
  });

  it("should create daily snapshots", async () => {
    const day0 = await snapshotTest.snapshotAt.call(
      latestTimestamp() + 0 * day
    );
    const day1 = await snapshotTest.snapshotAt.call(
      latestTimestamp() + 1 * day
    );
    const day2 = await snapshotTest.snapshotAt.call(
      latestTimestamp() + 2 * day
    );
    await snapshotTest.snapshotAt.call(latestTimestamp() + 3 * day);

    await snapshotTest.setValue(100);
    await increaseTime(moment.duration({ days: 1 }));
    await snapshotTest.setValue(200);
    await increaseTime(moment.duration({ days: 1 }));
    await snapshotTest.setValue(300);

    assert.equal(41, await snapshotTest.getValueAt.call(day0, 41));
    assert.equal(100, await snapshotTest.getValueAt.call(day1, 41));
    assert.equal(200, await snapshotTest.getValueAt.call(day2, 41));
  });

  it("should throw when queried in the future", async () => {
    const day1 = await snapshotTest.snapshotAt.call(
      latestTimestamp() + 1 * day
    );
    await expect(snapshotTest.getValueAt.call(day1, 41)).to.revert;
  });
});
