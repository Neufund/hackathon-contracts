pragma solidity ^0.4.11;

import './AccessControlled.sol';

contract ExampleRoles {

    bytes32 public constant ROLE_EXAMPLE = keccak256("Owner");

}

contract Example is AccessControlled, ExampleRoles {

    function Example(IAccessPolicy policy)
        AccessControlled(policy)
    {
    }

    function someFunction()
        public
        only(ROLE_EXAMPLE)
    {
    }
}
