pragma solidity 0.4.15;

import '../AccessControl/AccessControlled.sol';
import '../Reclaimable.sol';

contract TestReclaimable is
    AccessControlled,
    Reclaimable
{

    function TestReclaimable(IAccessPolicy accessPolicy)
        AccessControlled(accessPolicy)
        Reclaimable([])
    {
    }
}
