import { hasEvent, eventValue } from "./events";

export const Status = Object.freeze({
  SUCCESS: 0,
  NOT_ENOUGH_NEUMARKS_TO_UNLOCK: 1,
  INSUFFICIENT_FUNDS: 2
});
export default function error(tx) {
  // Default to zero on no error
  if (!hasEvent(tx, "Error")) {
    return 0;
  }

  return parseInt(eventValue(tx, "Error", "code"), 10);
}
