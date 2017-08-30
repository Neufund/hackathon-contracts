import { expect } from "chai";
import { last } from "lodash";
import EvmError from "./helpers/EVMThrow";
import { sequence } from "./helpers/promiseUtils";
import { closeFutureDate, HOUR, MONTH } from "./helpers/latestTime";
import { setTimeTo } from "./helpers/increaseTime";
import { etherToWei } from "./helpers/unitConverter";
import deployAllContracts from "./helpers/deploy";
import {
  curveInEther,
  deployMutableCurve,
  ethToEur
} from "./helpers/verification";

contract(
  "WhitelistedCommitment",
  ([_, lockAdminAccount, whitelistAdminAccount, ...accounts]) => {
    describe("set ordered whitelist", () => {
      it("should work", async () => {
        const mutableCurve = await deployMutableCurve();
        const investors = [accounts[0], accounts[1]];
        const tickets = [etherToWei(1), etherToWei(2)];
        const expectedNeumarks = [
          await mutableCurve.issueInEth(tickets[0]),
          await mutableCurve.issueInEth(tickets[1])
        ];

        const { commitment } = await deployAllContracts(
          lockAdminAccount,
          whitelistAdminAccount
        );
        await commitment.setOrderedWhitelist(investors, tickets, {
          from: whitelistAdminAccount
        });

        expect(await commitment.fixedCostInvestors(0)).to.be.eq(investors[0]);
        expect(await commitment.fixedCostInvestors(1)).to.be.eq(investors[1]);
        await expect(commitment.fixedCostInvestors).to.blockchainArrayOfSize(2);

        expect(
          await commitment.fixedCostTickets(investors[0])
        ).to.be.bignumber.eq(tickets[0]);
        expect(
          await commitment.fixedCostTickets(investors[1])
        ).to.be.bignumber.eq(tickets[1]);

        expect(
          await commitment.fixedCostNeumarks(investors[0])
        ).to.be.bignumber.eq(expectedNeumarks[0]);
        expect(
          await commitment.fixedCostNeumarks(investors[1])
        ).to.be.bignumber.eq(expectedNeumarks[1]);

        expect(await commitment.whitelisted(investors[0])).to.be.true;
        expect(await commitment.whitelisted(investors[1])).to.be.true;
      });

      it("should not be possible to set it twice", async () => {
        const { commitment } = await deployAllContracts(
          lockAdminAccount,
          whitelistAdminAccount
        );
        const investors = [accounts[0], accounts[1]];
        const tickets = [etherToWei(1), etherToWei(2)];

        await commitment.setOrderedWhitelist(investors, tickets, {
          from: whitelistAdminAccount
        });

        await expect(
          commitment.setOrderedWhitelist(investors, tickets, {
            from: whitelistAdminAccount
          })
        ).to.be.rejectedWith(EvmError);
      });

      it("should not be possible to set it after commitment is started", async () => {
        const startingDate = closeFutureDate();
        const {
          commitment
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: { startTimestamp: startingDate }
        });
        const investors = [accounts[0], accounts[1]];
        const tickets = [etherToWei(1), etherToWei(2)];

        await setTimeTo(startingDate);

        await expect(
          commitment.setOrderedWhitelist(investors, tickets, {
            from: whitelistAdminAccount
          })
        ).to.be.rejectedWith(EvmError);
      });

      it("should not be possible to set it with not matching input", async () => {
        const { commitment } = await deployAllContracts(
          lockAdminAccount,
          whitelistAdminAccount
        );
        const investors = [accounts[0]];
        const tickets = [etherToWei(1), etherToWei(2)];

        await expect(
          commitment.setOrderedWhitelist(investors, tickets, {
            from: whitelistAdminAccount
          })
        ).to.be.rejectedWith(EvmError);
      });

      it(
        "should not cross gas limit of 4 000 000 when inserting 100 investors"
      );
    });

    describe("set whitelisted investors", () => {
      it("should work", async () => {
        const { commitment } = await deployAllContracts(
          lockAdminAccount,
          whitelistAdminAccount
        );
        const investors = [accounts[0], accounts[1]];

        await commitment.setWhitelist(investors, {
          from: whitelistAdminAccount
        });

        expect(await commitment.whitelistedInvestors(0)).to.be.eq(investors[0]);
        expect(await commitment.whitelistedInvestors(1)).to.be.eq(investors[1]);
        await expect(commitment.whitelistedInvestors).to.blockchainArrayOfSize(
          2
        );

        expect(await commitment.whitelisted(investors[0])).to.be.true;
        expect(await commitment.whitelisted(investors[1])).to.be.true;

        await expect(commitment.fixedCostInvestors).to.blockchainArrayOfSize(0);
      });

      it("should not be possible to set it twice", async () => {
        const { commitment } = await deployAllContracts(
          lockAdminAccount,
          whitelistAdminAccount
        );
        const investors = [accounts[0], accounts[1]];

        await commitment.setWhitelist(investors, {
          from: whitelistAdminAccount
        });

        await expect(
          commitment.setWhitelist(investors, { from: whitelistAdminAccount })
        ).to.be.rejectedWith(EvmError);
      });

      it("should not be possible to set it after commitment is started", async () => {
        const startingDate = closeFutureDate();
        const {
          commitment
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: { startTimestamp: startingDate }
        });
        const investors = [accounts[0], accounts[1]];

        await setTimeTo(startingDate);

        await expect(
          commitment.setWhitelist(investors, { from: whitelistAdminAccount })
        ).to.be.rejectedWith(EvmError);
      });
      it(
        "should not cross gas limit of 4 000 000 when inserting 1000 investors"
      );
    });

    describe("set whitelist investor with fixed investors", () => {
      it("should be possible to whitelist investors before fixed investors", async () => {
        const { commitment } = await deployAllContracts(
          lockAdminAccount,
          whitelistAdminAccount
        );
        const whitelistedInvestors = [accounts[0], accounts[1]];
        const fixedInvestors = [accounts[2]];
        const fixedTickets = [etherToWei(1)];

        await commitment.setWhitelist(whitelistedInvestors, {
          from: whitelistAdminAccount
        });
        await commitment.setOrderedWhitelist(fixedInvestors, fixedTickets, {
          from: whitelistAdminAccount
        });

        expect(await commitment.whitelistedInvestors(0)).to.be.eq(
          whitelistedInvestors[0]
        );
        expect(await commitment.whitelistedInvestors(1)).to.be.eq(
          whitelistedInvestors[1]
        );
        await expect(commitment.whitelistedInvestors).to.blockchainArrayOfSize(
          2
        );

        expect(await commitment.whitelisted(whitelistedInvestors[0])).to.be
          .true;
        expect(await commitment.whitelisted(whitelistedInvestors[1])).to.be
          .true;
        expect(await commitment.whitelisted(fixedInvestors[0])).to.be.true;

        expect(await commitment.fixedCostInvestors(0)).to.be.eq(
          fixedInvestors[0]
        );
        await expect(commitment.fixedCostInvestors).to.blockchainArrayOfSize(1);

        expect(
          await commitment.fixedCostTickets(fixedInvestors[0])
        ).to.be.bignumber.eq(fixedTickets[0]);
        expect(
          await commitment.fixedCostTickets(whitelistedInvestors[0])
        ).to.be.bignumber.eq(0);
        expect(
          await commitment.fixedCostTickets(whitelistedInvestors[1])
        ).to.be.bignumber.eq(0);
      });

      it("should be possible to whitelist investors after fixed investors", async () => {
        const { commitment } = await deployAllContracts(
          lockAdminAccount,
          whitelistAdminAccount
        );
        const whitelistedInvestors = [accounts[0], accounts[1]];
        const fixedInvestors = [accounts[2]];
        const fixedTickets = [etherToWei(1)];

        await commitment.setOrderedWhitelist(fixedInvestors, fixedTickets, {
          from: whitelistAdminAccount
        });
        await commitment.setWhitelist(whitelistedInvestors, {
          from: whitelistAdminAccount
        });

        expect(await commitment.whitelistedInvestors(0)).to.be.eq(
          whitelistedInvestors[0]
        );
        expect(await commitment.whitelistedInvestors(1)).to.be.eq(
          whitelistedInvestors[1]
        );
        await expect(commitment.whitelistedInvestors).to.blockchainArrayOfSize(
          2
        );

        expect(await commitment.whitelisted(whitelistedInvestors[0])).to.be
          .true;
        expect(await commitment.whitelisted(whitelistedInvestors[1])).to.be
          .true;
        expect(await commitment.whitelisted(fixedInvestors[0])).to.be.true;

        expect(await commitment.fixedCostInvestors(0)).to.be.eq(
          fixedInvestors[0]
        );
        await expect(commitment.fixedCostInvestors).to.blockchainArrayOfSize(1);

        expect(
          await commitment.fixedCostTickets(fixedInvestors[0])
        ).to.be.bignumber.eq(fixedTickets[0]);
        expect(
          await commitment.fixedCostTickets(whitelistedInvestors[0])
        ).to.be.bignumber.eq(0);
        expect(
          await commitment.fixedCostTickets(whitelistedInvestors[1])
        ).to.be.bignumber.eq(0);
      });
    });

    describe("ordered whitelist commitment", () => {
      it("should work with tickets below declared", async () => {
        const startingDate = closeFutureDate();
        const mutableCurve = await deployMutableCurve();
        const fixedInvestors = [accounts[0], accounts[1]];
        const fixedDeclaredTickets = [etherToWei(2), etherToWei(3)];
        const actualInvestorsCommitments = [etherToWei(1), etherToWei(2)];
        const expectedNeumarkAmmountForDeclaredTickets = [
          await mutableCurve.issueInEth(fixedDeclaredTickets[0]),
          await mutableCurve.issueInEth(fixedDeclaredTickets[1])
        ];
        const expectedInvestorsNeumarkShares = [
          expectedNeumarkAmmountForDeclaredTickets[0]
            .mul(actualInvestorsCommitments[0])
            .div(fixedDeclaredTickets[0])
            .div(2)
            .round(0, 4),
          expectedNeumarkAmmountForDeclaredTickets[1]
            .mul(actualInvestorsCommitments[1])
            .div(fixedDeclaredTickets[1])
            .div(2)
            .round(0, 4)
        ];

        const {
          commitment,
          lockedAccount
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: {
            fixedInvestors,
            fixedTickets: fixedDeclaredTickets,
            startTimestamp: startingDate
          }
        });
        await setTimeTo(startingDate);
        await commitment.commit({
          value: actualInvestorsCommitments[0],
          from: fixedInvestors[0]
        });
        await commitment.commit({
          value: actualInvestorsCommitments[1],
          from: fixedInvestors[1]
        });

        expect(
          await lockedAccount.balanceOf(fixedInvestors[0])
        ).to.be.balanceWith({
          ether: actualInvestorsCommitments[0],
          neumarks: expectedInvestorsNeumarkShares[0]
        });
        expect(
          await lockedAccount.balanceOf(fixedInvestors[1])
        ).to.be.balanceWith({
          ether: actualInvestorsCommitments[1],
          neumarks: expectedInvestorsNeumarkShares[1]
        });
      });

      it("should send all funds in case of rounding errors", async () => {
        const startingDate = closeFutureDate();
        const investor1 = accounts[0];
        const fixedInvestors = [investor1];
        const fixedDeclaredTickets = [etherToWei(2)];
        const actualInvestor1Commitment1 = etherToWei(1.9);
        const actualInvestor1Commitment2 = etherToWei(0.1);

        const expectedTicketsSum = fixedDeclaredTickets[0];
        const expectedNeumarkAmmount = await curveInEther(expectedTicketsSum);
        const expectedInvestor1NeumarkShare = expectedNeumarkAmmount
          .div(2)
          .round(0, 4)
          .add(1); // for rounding error

        const {
          commitment,
          lockedAccount,
          neumark
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: {
            fixedInvestors,
            fixedTickets: fixedDeclaredTickets,
            startTimestamp: startingDate,
            minTicket: etherToWei(0.01)
          }
        });
        await setTimeTo(startingDate);
        await commitment.commit({
          value: actualInvestor1Commitment1,
          from: investor1
        });
        await commitment.commit({
          value: actualInvestor1Commitment2,
          from: investor1
        });

        expect(await lockedAccount.balanceOf(investor1)).to.be.balanceWith({
          ether: actualInvestor1Commitment1.add(actualInvestor1Commitment2),
          neumarks: expectedInvestor1NeumarkShare
        });
        expect(await neumark.balanceOf(commitment.address)).to.be.bignumber.eq(
          new web3.BigNumber(0)
        );
      });

      const commitWithoutRemainderTests = [...Array(10).keys()];

      commitWithoutRemainderTests.forEach(remainderWei => {
        it(`should receive neumarks for remainder of ${remainderWei +
          1} wei`, async () => {
          await commitWithoutRemainder(remainderWei + 1);
        });
      });

      async function commitWithoutRemainder(remainderWei) {
        const startingDate = closeFutureDate();
        const investor1 = accounts[0];
        const fixedInvestors = [investor1];
        const fixedDeclaredTickets = [etherToWei(2.1092830910928081)];
        const eurEthRate = 0.4398719873;
        const eurEthRateWei = etherToWei(eurEthRate); // sets up a rate allowing for rounding errors

        const {
          commitment,
          lockedAccount,
          neumark
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: {
            fixedInvestors,
            fixedTickets: fixedDeclaredTickets,
            startTimestamp: startingDate,
            minTicket: etherToWei(0),
            eurEthRate: eurEthRateWei
          }
        });
        // console.log(await neumark.balanceOf(commitment.address));
        const totalNeumarkIssued = await curveInEther(
          fixedDeclaredTickets[0],
          eurEthRateWei
        );
        // investor will invest almost a full ticket but without small remainder
        const actualInvestor1Commitment = fixedDeclaredTickets[0].sub(
          remainderWei
        );
        // compute actual neumarks reward by proportion and then take half
        const expectedInvestor1NeumarkShare = totalNeumarkIssued
          .mul(actualInvestor1Commitment)
          .div(fixedDeclaredTickets[0])
          .round(0, 4)
          .div(2)
          .round(0, 4);
        // console.log(expectedInvestor1NeumarkShare);

        await setTimeTo(startingDate);
        await commitment.commit({
          value: actualInvestor1Commitment,
          from: investor1
        });
        expect(await lockedAccount.balanceOf(investor1)).to.be.balanceWith({
          ether: actualInvestor1Commitment,
          neumarks: expectedInvestor1NeumarkShare
        });
        expect(
          await commitment.fixedCostTickets(investor1)
        ).to.be.bignumber.equal(remainderWei);
        // invest remaining weis
        await commitment.commit({
          value: remainderWei,
          from: investor1
        });
        // tickets zeroed
        expect(
          await commitment.fixedCostTickets(investor1)
        ).to.be.bignumber.equal(0);
        expect(
          await commitment.fixedCostNeumarks(investor1)
        ).to.be.bignumber.equal(0);
        // neumakrs held by commitment contract zeroed
        expect(await neumark.balanceOf(commitment.address)).to.be.bignumber.eq(
          0
        );
      }

      it("should work with ticket exactly the same as declared", async () => {
        const startingDate = closeFutureDate();
        const mutableCurve = await deployMutableCurve();
        const investor1 = accounts[0];
        const fixedInvestors = [investor1, accounts[1]];
        const fixedDeclaredTickets = [etherToWei(1.21981798), etherToWei(3)];
        const actualInvestor1Commitment = etherToWei(1.21981798);
        const expectedNeumarkAmmount = (await mutableCurve.issueInEth(
          actualInvestor1Commitment
        ))
          .div(2)
          .round(0, 4);

        const {
          commitment,
          lockedAccount
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: {
            fixedInvestors,
            fixedTickets: fixedDeclaredTickets,
            startTimestamp: startingDate
          }
        });
        await setTimeTo(startingDate);
        await commitment.commit({
          value: actualInvestor1Commitment,
          from: investor1
        });

        expect(await lockedAccount.balanceOf(investor1)).to.be.balanceWith({
          ether: actualInvestor1Commitment,
          neumarks: expectedNeumarkAmmount
        });
      });

      it("should work with ticket much bigger then declared", async () => {
        await investorTicketBiggerThenDeclared(
          accounts.slice(0, 2),
          [etherToWei(1), etherToWei(3)],
          etherToWei(1.2345)
        );
      });

      it("should work with ticket a little bit bigger then declared", async () => {
        await investorTicketBiggerThenDeclared(
          accounts.slice(0, 1),
          [etherToWei(1)],
          etherToWei(1).add(1)
        );
      });

      it("should allow fixed investor to make commitment in mulitple tickets", async () => {
        const startingDate = closeFutureDate();
        const mutableCurve = await deployMutableCurve();
        const investor = accounts[0];
        const actualInvestorTickets = [
          etherToWei(1.19280128309),
          etherToWei(11.1298001),
          etherToWei(1.8991)
        ];
        const totalDeclaredTicket = actualInvestorTickets.reduce(
          (s, v) => s.add(v),
          new web3.BigNumber(0)
        );
        const expectedNeumarkAmountForDeclaredTicket = await mutableCurve.issueInEth(
          totalDeclaredTicket
        );
        const expectedNeumarkAmountForInvestor = expectedNeumarkAmountForDeclaredTicket
          .div(2)
          .round(0, 4);
        const {
          commitment,
          lockedAccount,
          neumark
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: {
            fixedInvestors: [investor],
            fixedTickets: [totalDeclaredTicket],
            startTimestamp: startingDate
          }
        });
        expect(await neumark.balanceOf(commitment.address)).to.be.bignumber.eq(
          expectedNeumarkAmountForDeclaredTicket
        );
        await setTimeTo(startingDate);
        for (const ticket of actualInvestorTickets) {
          await commitment.commit({
            value: ticket,
            from: investor
          });
        }
        // this will allow single Ulp of rounding errors per ticket
        const lockedNeumarkBalance = (await lockedAccount.balanceOf(
          investor
        ))[1];
        expect(
          lockedNeumarkBalance.sub(expectedNeumarkAmountForInvestor).abs()
        ).to.be.bignumber.most(actualInvestorTickets.length);
      });
      it("should not allow whitelisted investor to take part in fixed ");
      it("should not work when investor is not on the list");
      it("should not be possible to invest before ico");
    });

    describe("whitelisted commitment", () => {
      it("should work for whitelisted investors", async () => {
        const verificationCurve = await deployMutableCurve();
        const startingDate = closeFutureDate();
        const whitelistedInvestors = [accounts[0], accounts[1]];
        const ticketSizes = [etherToWei(1.5), etherToWei(5)];

        const expectedNeumarksAmmount = [
          (await verificationCurve.issueInEth(ticketSizes[0]))
            .div(2)
            .round(0, 4),
          (await verificationCurve.issueInEth(ticketSizes[1]))
            .div(2)
            .round(0, 4)
        ];

        const {
          commitment,
          lockedAccount
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: {
            whitelistedInvestors,
            startTimestamp: startingDate
          }
        });
        await setTimeTo(startingDate);
        await commitment.commit({
          value: ticketSizes[0],
          from: whitelistedInvestors[0]
        });
        await commitment.commit({
          value: ticketSizes[1],
          from: whitelistedInvestors[1]
        });

        expect(
          await lockedAccount.balanceOf(whitelistedInvestors[0])
        ).to.be.balanceWith({
          ether: ticketSizes[0],
          neumarks: expectedNeumarksAmmount[0]
        });
        expect(
          await lockedAccount.balanceOf(whitelistedInvestors[1])
        ).to.be.balanceWith({
          ether: ticketSizes[1],
          neumarks: expectedNeumarksAmmount[1]
        });
      });

      it("should not work with not whitelisted investors", async () => {
        const startingDate = closeFutureDate();
        const whitelistedInvestors = [accounts[0], accounts[1]];
        const investor = accounts[2];
        const ticketSize = etherToWei(1.5);

        const {
          commitment
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: {
            whitelistedInvestors,
            startTimestamp: startingDate
          }
        });
        await setTimeTo(startingDate);

        expect(
          commitment.commit({ value: ticketSize, from: investor })
        ).to.be.rejectedWith(EvmError);
      });

      it("should not be possible to invest before ICO", async () => {
        const startingDate = closeFutureDate();
        const whitelistedInvestors = [accounts[0], accounts[1]];
        const investor = accounts[2];
        const ticketSize = etherToWei(1.5);

        const {
          commitment
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: {
            whitelistedInvestors,
            startTimestamp: startingDate
          }
        });

        expect(
          commitment.commit({ value: ticketSize, from: investor })
        ).to.be.rejectedWith(EvmError);
      });

      it("should not be possible to invest after ICO", async () => {
        const startingDate = closeFutureDate();
        const duration = MONTH;
        const whitelistedInvestors = [accounts[0], accounts[1]];
        const investor = accounts[2];
        const ticketSize = etherToWei(1.5);

        const {
          commitment
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: {
            whitelistedInvestors,
            duration,
            startTimestamp: startingDate
          }
        });
        await setTimeTo(startingDate + duration + HOUR);

        expect(
          commitment.commit({ value: ticketSize, from: investor })
        ).to.be.rejectedWith(EvmError);
      });
    });

    describe("failed comittment", () => {
      it("should unlock all accounts", async () => {
        const startingDate = closeFutureDate();
        const duration = MONTH;
        const whitelistedInvestors = [accounts[4], accounts[5]];
        const investor = whitelistedInvestors[0];
        const ticketSize = etherToWei(1.5);
        const initialAccountBalance = await web3.eth.getBalance(investor);
        const gasPrice = 1;
        let accGas;

        const {
          commitment,
          lockedAccount,
          etherToken
        } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
          commitmentCfg: {
            whitelistedInvestors,
            duration,
            startTimestamp: startingDate
          }
        });
        await setTimeTo(startingDate + HOUR);
        accGas = accumulateGasPrice(
          await commitment.commit({
            value: ticketSize,
            from: investor,
            gasPrice
          }),
          accGas
        );
        await setTimeTo(startingDate + MONTH + HOUR);

        accGas = accumulateGasPrice(
          await commitment.finalize({ from: investor, gasPrice }),
          accGas
        );
        accGas = accumulateGasPrice(
          await lockedAccount.unlock({ from: investor, gasPrice }),
          accGas
        );
        accGas = accumulateGasPrice(
          await etherToken.withdraw(ticketSize, { from: investor, gasPrice }),
          accGas
        );

        const gasCost = accGas.mul(gasPrice);
        const finalAccountBalance = await web3.eth.getBalance(investor);

        expect(finalAccountBalance).to.be.bignumber.eq(
          initialAccountBalance.sub(gasCost)
        );
      });
    });

    describe("successful comittment", () => {
      it("should burn unused neumarks from fixed pool", async () => {
        // sets min cap so commitment is successful
        await shouldBurnUnusedNeumarks(etherToWei(0.5));
      });
    });

    describe("finalized comittment", () => {
      it("should not reclaim Neumark token before finalization");
    });

    async function shouldBurnUnusedNeumarks(minAbsCap) {
      const startingDate = closeFutureDate();
      const duration = MONTH;
      const investor1 = accounts[0];
      const fixedInvestors = [investor1, accounts[1]];
      const fixedDeclaredTickets = [etherToWei(1), etherToWei(3)];
      const expectedTicketsSum = fixedDeclaredTickets[0].add(
        fixedDeclaredTickets[1]
      );

      const {
        commitment,
        neumark
      } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
        commitmentCfg: {
          fixedInvestors,
          fixedTickets: fixedDeclaredTickets,
          startTimestamp: startingDate,
          minAbsCap,
          duration
        }
      });

      // euro for which neumarks were issued must match tickets
      expect(await neumark.totalEuroUlps()).to.be.bignumber.eq(
        ethToEur(expectedTicketsSum)
      );

      await setTimeTo(startingDate);
      await commitment.commit({
        value: fixedDeclaredTickets[0],
        from: investor1
      });

      await setTimeTo(startingDate + duration + HOUR);
      await commitment.finalize();

      expect(await commitment.wasSuccessful()).to.be.true;

      // neumarks corresponding to ticket 1 must be burned to curve is rollbacked to ticket 0
      expect(await neumark.totalEuroUlps()).to.be.bignumber.eq(
        ethToEur(fixedDeclaredTickets[0])
      );
    }

    async function investorTicketBiggerThenDeclared(
      investorAccounts,
      investorDeclaration,
      firstInvestorTicket
    ) {
      const startingDate = closeFutureDate();
      const mutableCurve = await deployMutableCurve();
      const equalShareSize = investorDeclaration[0];
      const curveShareSize = firstInvestorTicket.sub(equalShareSize);
      const expectedNeumarkAmmountIssuance = [
        ...(await sequence(investorDeclaration, mutableCurve.issueInEth)),
        await mutableCurve.issueInEth(curveShareSize)
      ];
      const expectedInvestor1NeumarkShare = new web3.BigNumber(0)
        .add(expectedNeumarkAmmountIssuance[0]) // fixed part
        .add(last(expectedNeumarkAmmountIssuance)) // curve part
        .div(2)
        .round(0, 4);

      const {
        commitment,
        lockedAccount
      } = await deployAllContracts(lockAdminAccount, whitelistAdminAccount, {
        commitmentCfg: {
          fixedInvestors: investorAccounts,
          fixedTickets: investorDeclaration,
          startTimestamp: startingDate
        }
      });
      await setTimeTo(startingDate);
      await commitment.commit({
        value: firstInvestorTicket,
        from: investorAccounts[0]
      });

      expect(
        await lockedAccount.balanceOf(investorAccounts[0])
      ).to.be.balanceWith({
        ether: firstInvestorTicket,
        neumarks: expectedInvestor1NeumarkShare
      });
    }
  }
);

function accumulateGasPrice(tx, acc = new web3.BigNumber(0)) {
  return new web3.BigNumber(tx.receipt.gasUsed).add(acc);
}
