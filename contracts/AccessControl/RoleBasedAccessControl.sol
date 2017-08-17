pragma solidity ^0.4.11;

import './IAccessPolicy.sol';
import './IAccessControlled.sol';
import './AccessControlled.sol';

contract RoleBasedAccessControl is IAccessPolicy, AccessControlled {

    ////////////////
    // Types
    ////////////////

    // Łukasiewicz logic values
    enum TriState {
        Unset,
        True,
        False
    }

    ////////////////
    // Constants
    ////////////////

    IAccessControlled public constant GLOBAL = IAccessControlled(0x0);

    ////////////////
    // State
    ////////////////

    mapping (address => mapping(bytes32 => mapping(address => TriState))) access;

    // TODO: Retrieve list of contracts
    // TODO: Retrieve list of users per role

    ////////////////
    // Events
    ////////////////

    event AccessChanged(
        address controler,
        address subject,
        bytes32 role,
        IAccessControlled object,
        TriState oldValue,
        TriState newValue
    );

    event Access(
        address subject,
        bytes32 role,
        IAccessControlled object,
        bytes4 verb,
        bool granted
    );

    ////////////////
    // Constructor
    ////////////////

    function RoleBasedAccessControl()
        AccessControlled(this) // We are our own policy. This is immutable.
    {
        // Issue the glboal AccessContoler role to creator
        access[msg.sender][ROLE_ACCESS_CONTROLER][GLOBAL] = TriState.True;
    }

    ////////////////
    // Public functions
    ////////////////

    // Overrides `AccessControlled.setAccessPolicy(IAccessPolicy)`
    function setAccessPolicy(IAccessPolicy)
        public
        only(ROLE_ACCESS_CONTROLER)
    {
        // `RoleBasedAccessControl` always controls its
        // own access. Disallow changing this by overriding
        // the `AccessControlled.setAccessPolicy` function.
        revert();
    }

    // Implements `IAccessPolicy.allowed(IAccessControlled, bytes32, address, bytes4)`
    function allowed(
        address subject,
        bytes32 role,
        IAccessControlled object,
        bytes4 verb
    )
        public
        // constant // NOTE: Solidity does not allow subtyping interfaces
        returns (bool)
    {
        // Try local access first
        TriState localAccess = access[subject][role][object];
        if (localAccess != TriState.Unset) {
            bool grantedLocal = localAccess == TriState.True;

            // Log and return
            Access(subject, role, object, verb, grantedLocal);
            return grantedLocal;
        }

        // Try global state
        TriState globalAccess = access[subject][role][GLOBAL];
        bool granted = globalAccess == TriState.True;

        // Log and return
        Access(subject, role, object, verb, granted);
        return granted;
    }

    // Assign a role to a user globally
    function setUserRole(
        address subject,
        bytes32 role,
        TriState access
    )
        public
    {
        return setUserRole(subject, role, GLOBAL, access);
    }

    // Assign a role to a user globally
    function setUserRole(
        address subject,
        bytes32 role,
        IAccessControlled object,
        TriState newValue
    )
        public
        only(ROLE_ACCESS_CONTROLER)
    {
        TriState oldValue = access[object][role][subject];
        access[object][role][subject] = newValue;

        // An access controler is not allowed to revoke his own right on this
        // contract. This prevents access controlers from locking themselves
        // out. We also require the current contract to be its own policy for
        // this to work. This is enforced elsewhere.
        if(subject == msg.sender && role == ROLE_ACCESS_CONTROLER) {
            require(allowed(subject, ROLE_ACCESS_CONTROLER, this, msg.sig));
        }

        // Log
        AccessChanged(msg.sender, subject, role, object, oldValue, newValue);
    }
}
