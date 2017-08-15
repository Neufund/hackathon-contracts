pragma solidity ^0.4.11;

import './IAccessControlled.sol';

interface IAccessPolicy {

    // Note: we don't make this function constant to allow for
    //       state-updating access controls such as rate limiting.
    function allowed(
        address subject,
        bytes32 role,
        IAccessControlled object,
        bytes4 verb
    )
        public
        returns (bool);
}
