import invariant from "invariant";
import { gasCost } from "./gasUtils";

export default function(chai) {
  chai.Assertion.addMethod(
    "blockchainArrayOfSize",
    async function blockchainArrayOfSize(size) {
      invariant(size >= 0, "Size has to be >= 0");

      // I would love to hear ideas for better implementation

      const web3ArrayAccessor = this._obj;

      // negative indexes seems to not play nicely with web3 so we skip this case
      if (size !== 0) {
        try {
          await web3ArrayAccessor(size - 1);
        } catch (e) {
          this.assert(
            false,
            `expected web3 array to be size of ${size} but it looks like it's smaller` // i think it's impossible to get an array name in this point
          );
        }
      }
    }
  );

  chai.Assertion.addMethod("respectGasLimit", function respectGasLimit(
    gasLimit
  ) {
    invariant(gasLimit >= 0, "Gas has to be >= 0");

    if (process.env.SKIP_GAS_CHECKS) {
      return;
    }

    const object = this._obj;

    const usedGas = gasCost(object);
    this.assert(
      usedGas <= gasLimit,
      `Consumed gas ${usedGas} is more than ${gasLimit} limit.`
    );
  });

  chai.Assertion.addProperty("revert", async function revert() {
    try {
      await this._obj;
      this.assert(false, "Transaction did not revert.");
    } catch (error) {
      const invalidOpcode = error.message.search("invalid opcode") >= 0;
      this.assert(
        invalidOpcode,
        "Transaction did not revert with the right error."
      );
    }
  });
}
