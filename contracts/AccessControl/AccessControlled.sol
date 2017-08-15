pragma solidity ^0.4.11;

import './IAccessControlled.sol';
import './StandardRoles.sol';

contract AccessControlled is IAccessControlled, StandardRoles {

    IAccessPolicy public accessPolicy;

    modifier only(bytes32 role) {
        require(accessPolicy.allowed(msg.sender, role, this, msg.sig));
        _;
    }

    function AccessControlled(IAccessPolicy policy) {
        accessPolicy = policy;
    }

    function accessPolicy()
        public
        returns (IAccessPolicy)
    {
        return accessPolicy;
    }

    function setAccessPolicy(IAccessPolicy newPolicy)
        public
        only(ROLE_ACCESS_CONTROLER)
    {
        // The access controler also needs to have this
        // role under the new policy. This provides some
        // protection agains locking yourself out.
        require(newPolicy.allowed(msg.sender, ROLE_ACCESS_CONTROLER, this, msg.sig));

        // We can now safely set the new policy without foot shooting.
        IAccessPolicy oldPolicy = accessPolicy;
        accessPolicy = newPolicy;

        // Log event
        AccessPolicyChanged(msg.sender, oldPolicy, newPolicy);
    }
}
