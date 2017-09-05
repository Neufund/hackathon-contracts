pragma solidity 0.4.15;

import './IAccessPolicy.sol';
import './IAccessControlled.sol';
import './AccessControlled.sol';
import '../Reclaimable.sol';


contract RoleBasedAccessControl is
    IAccessPolicy,
    AccessControlled,
    Reclaimable
{

    ////////////////
    // Types
    ////////////////

    // Łukasiewicz logic values
    enum TriState {
        Unset,
        Allow,
        Deny
    }

    ////////////////
    // Constants
    ////////////////

    IAccessControlled public constant GLOBAL = IAccessControlled(0x0);

    address public constant EVERYONE = 0x0;

    ////////////////
    // State
    ////////////////

    // subject → role → object → allowed
    mapping (address => mapping(bytes32 => mapping(address => TriState))) access;

    // object → role → addresses
    mapping (address => mapping(bytes32 => address[])) accessList;

    ////////////////
    // Events
    ////////////////

    event AccessChanged(
        address controller,
        address indexed subject,
        bytes32 role,
        IAccessControlled indexed object,
        TriState oldValue,
        TriState newValue
    );

    event Access(
        address indexed subject,
        bytes32 role,
        IAccessControlled indexed object,
        bytes4 verb,
        bool granted
    );

    ////////////////
    // Constructor
    ////////////////

    function RoleBasedAccessControl()
        AccessControlled(this) // We are our own policy. This is immutable.
    {
        // Issue the local and global AccessContoler role to creator
        access[msg.sender][ROLE_ACCESS_CONTROLER][this] = TriState.Allow;
        access[msg.sender][ROLE_ACCESS_CONTROLER][GLOBAL] = TriState.Allow;
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
        bool set = false;
        bool allow = false;
        TriState value = TriState.Unset;

        // Cascade local, everyone local, global, everyone global
        value = access[subject][role][object];
        set = value != TriState.Unset;
        allow = value == TriState.Allow;
        if (!set) {
            value = access[EVERYONE][role][object];
            set = value != TriState.Unset;
            allow = value == TriState.Allow;
        }
        if (!set) {
            value = access[subject][role][GLOBAL];
            set = value != TriState.Unset;
            allow = value == TriState.Allow;
        }
        if (!set) {
            value = access[EVERYONE][role][GLOBAL];
            set = value != TriState.Unset;
            allow = value == TriState.Allow;
        }
        if (!set) {
            allow = false;
        }

        // Log and return
        Access(subject, role, object, verb, allow);
        return allow;
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
        setUserRolePrivate(subject, role, object, newValue);
    }

    // Atomically change a set of role assignments
    function setUserRoles(
        address[] subjects,
        bytes32[] roles,
        IAccessControlled[] objects,
        TriState[] newValues
    )
        public
        only(ROLE_ACCESS_CONTROLER)
    {
        require(subjects.length == roles.length);
        require(subjects.length == objects.length);
        require(subjects.length == newValues.length);
        for(uint i = 0; i < subjects.length; i++) {
            setUserRolePrivate(subjects[i], roles[i], objects[i], newValues[i]);
        }
    }

    function getValue(
        address subject,
        bytes32 role,
        IAccessControlled object
    )
        public
        constant
        returns (TriState)
    {
        return access[subject][role][object];
    }

    function getUsers(
        IAccessControlled object,
        bytes32 role
    )
        public
        constant
        returns (address[])
    {
        return accessList[object][role];
    }

    ////////////////
    // Private functions
    ////////////////

    function setUserRolePrivate(
        address subject,
        bytes32 role,
        IAccessControlled object,
        TriState newValue
    )
        private
    {
        // An access controler is not allowed to revoke his own right on this
        // contract. This prevents access controlers from locking themselves
        // out. We also require the current contract to be its own policy for
        // this to work. This is enforced elsewhere.
        require(role != ROLE_ACCESS_CONTROLER || subject != msg.sender || object != this);

        // Fetch old value and short-circuit no-ops
        TriState oldValue = access[subject][role][object];
        if(oldValue == newValue) {
            return;
        }

        // Update the mapping
        access[subject][role][object] = newValue;

        // Update the list on add / remove
        address[] storage list = accessList[object][role];
        if(oldValue == TriState.Unset && newValue != TriState.Unset) {
            list.push(subject);
        }
        if(oldValue != TriState.Unset && newValue == TriState.Unset) {
            for(uint i = 0; i < list.length; i++) {
                if(list[i] == subject) {
                    list[i] = list[list.length - 1];
                    delete list[list.length - 1];
                    list.length -= 1;
                }
            }
        }

        // Log
        AccessChanged(msg.sender, subject, role, object, oldValue, newValue);
    }
}
