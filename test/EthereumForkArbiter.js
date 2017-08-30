import { expect } from "chai";
import { prettyPrintGasCost } from "./helpers/gasUtils";
import createAccessPolicy from "./helpers/createAccessPolicy";
import { eventValue } from "./helpers/events";

const EthereumForkArbiter = artifacts.require("EthereumForkArbiter");

contract("EthereumForkArbiter", ([deployer, arbiter, other]) => {
  let ethereumForkArbiter;

  beforeEach(async () => {
    const accessPolicy = await createAccessPolicy([
      { subject: arbiter, role: "ROLE_FORK_ARBITER" }
    ]);
    ethereumForkArbiter = await EthereumForkArbiter.new(accessPolicy);
  });

  it("should deploy", async () => {
    prettyPrintGasCost("Deploy", ethereumForkArbiter);
  });

  it("should announce forks", async () => {
    const name = "Spurious Dragon";
    const url =
      "https://blog.ethereum.org/2016/11/18/hard-fork-no-4-spurious-dragon/";

    const tx = await ethereumForkArbiter.announceFork(name, url, {
      from: arbiter
    });

    prettyPrintGasCost("Announce", tx);
    expect(eventValue(tx, "ForkAnnounced", "name")).to.equal(name);
    expect(eventValue(tx, "ForkAnnounced", "url")).to.equal(url);
  });

  it("should remember last announced fork", async () => {
    const expectedName = "Spurious Dragon";
    const expectedUrl =
      "https://blog.ethereum.org/2016/11/18/hard-fork-no-4-spurious-dragon/";

    await ethereumForkArbiter.announceFork(expectedName, expectedUrl, {
      from: arbiter
    });
    const actualName = await ethereumForkArbiter.nextForkName.call();
    const actualUrl = await ethereumForkArbiter.nextForkUrl.call();

    expect(actualName).to.equal(expectedName);
    expect(actualUrl).to.equal(expectedUrl);
  });

  it("should sign forks", async () => {
    const block = await web3.eth.getBlock("latest");

    const tx = await ethereumForkArbiter.signFork(block.number, block.hash, {
      from: arbiter
    });

    prettyPrintGasCost("Sign", tx);
    expect(eventValue(tx, "ForkSigned", "blockNumber")).to.be.bignumber.equal(
      block.number
    );
    expect(eventValue(tx, "ForkSigned", "blockHash")).to.be.equal(block.hash);
  });

  it("should check hash of signed fork", async () => {
    const block = await web3.eth.getBlock("latest");
    const hash =
      "0x8693c7c1ec855e1ef02fb45536ea545b0c3fc137d700dce21300a8254423d8a4";

    await expect(
      ethereumForkArbiter.signFork(block.number, hash, {
        from: arbiter
      })
    ).to.revert;
    await expect(
      ethereumForkArbiter.signFork(block.number, block.hash, {
        from: arbiter
      })
    ).to.not.revert;
  });

  it("should remember last signed fork", async () => {
    const latestBlock = await web3.eth.getBlock("latest");

    const tx = await ethereumForkArbiter.signFork(
      latestBlock.number,
      latestBlock.hash,
      { from: arbiter }
    );
    const actualNumber = await ethereumForkArbiter.lastSignedBlockNumber.call();
    const actualHash = await ethereumForkArbiter.lastSignedBlockHash.call();
    const actualTime = await ethereumForkArbiter.lastSignedTimestamp.call();
    const txBlock = await web3.eth.getBlock(tx.receipt.blockNumber);
    const expectedTime = txBlock.timestamp;

    expect(actualNumber).to.be.bignumber.equal(latestBlock.number);
    expect(actualHash).to.be.bignumber.equal(latestBlock.hash);
    expect(actualTime).to.be.bignumber.equal(expectedTime);
  });

  it("should only allow ROLE_FORK_ARBITER to announce", async () => {
    const name = "Spurious Dragon";
    const url =
      "https://blog.ethereum.org/2016/11/18/hard-fork-no-4-spurious-dragon/";

    await expect(
      ethereumForkArbiter.announceFork(name, url, {
        from: deployer
      })
    ).to.revert;
    await expect(
      ethereumForkArbiter.announceFork(name, url, {
        from: other
      })
    ).to.revert;
    await expect(
      ethereumForkArbiter.announceFork(name, url, {
        from: arbiter
      })
    ).to.not.revert;
  });

  it("should only allow ROLE_FORK_ARBITER to sign", async () => {
    const block = await web3.eth.getBlock("latest");

    await expect(
      ethereumForkArbiter.signFork(block.number, block.hash, {
        from: deployer
      })
    ).to.revert;
    await expect(
      ethereumForkArbiter.signFork(block.number, block.hash, {
        from: other
      })
    ).to.revert;
    await expect(
      ethereumForkArbiter.signFork(block.number, block.hash, {
        from: arbiter
      })
    ).to.not.revert;
  });
});
