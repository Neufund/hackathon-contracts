const ForceEther = artifacts.require("ForceEther");

export default async (address, amountWei, fromAddress) => {
  const forceEther = await ForceEther.new({
    value: amountWei,
    from: fromAddress
  });
  await forceEther.pay(address);
};
