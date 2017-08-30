import { etherToWei, DIGITS } from "./unitConverter";
import { eventValue } from "./events";
import { TriState, EVERYONE } from "./triState";

const RoleBasedAccessControl = artifacts.require("RoleBasedAccessControl");
const AccessRoles = artifacts.require("AccessRoles");
const Neumark = artifacts.require("Neumark");

async function deployNeumark() {
  const rbac = await RoleBasedAccessControl.new();
  const roles = await AccessRoles.new();
  const neumark = await Neumark.new(rbac.address);

  // TODO: more specific rights
  await rbac.setUserRole(
    EVERYONE,
    await roles.ROLE_NEUMARK_ISSUER(),
    neumark.address,
    TriState.Allow
  );
  await rbac.setUserRole(
    EVERYONE,
    await roles.ROLE_NEUMARK_BURNER(),
    neumark.address,
    TriState.Allow
  );
  await rbac.setUserRole(
    EVERYONE,
    await roles.ROLE_TRANSFERS_ADMIN(),
    neumark.address,
    TriState.Allow
  );

  return neumark;
}

// deploys separate curve instance for verification of issuance
export async function deployMutableCurve() {
  const neumark = await deployNeumark();

  return {
    issueInEth: async ether => {
      const euro = ethToEur(ether);
      const tx = await neumark.issueForEuro(euro);
      return eventValue(tx, "NeumarksIssued", "neumarkUlp");
    }
  };
}

let neumark;

export async function curveInEur(moneyInEurULP) {
  if (!neumark) {
    neumark = await deployNeumark();
  }

  return neumark.cumulative(moneyInEurULP);
}

export async function curveInEther(money, eurEtherRatio) {
  if (!neumark) {
    neumark = await deployNeumark();
  }

  const moneyInEurULP = ethToEur(money, eurEtherRatio);
  return neumark.cumulative(moneyInEurULP);
}

export function ethToEur(ether, eurEtherRatio = etherToWei(218.1192809)) {
  return ether.mul(eurEtherRatio).div(DIGITS).round(0, 4);
}

export function eurUlpToEth(eur, eurEtherRatio = 218.1192809) {
  return eur.div(eurEtherRatio).round(0, 4);
}
