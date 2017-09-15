pragma solidity 0.4.15;

import './Standards/IMigrationSource.sol';
import './AccessControl/AccessControlled.sol';
import './AccessRoles.sol';


/// @notice mixin that enables migration pattern for a contract
/// @dev when derived from
contract MigrationSource is
    IMigrationSource,
    AccessControlled,
    AccessRoles
{
    ////////////////////////
    // Mutable state
    ////////////////////////

    // migration target contract
    IMigrationTarget internal _migration;

    ////////////////////////
    // Modifiers
    ////////////////////////

    /// @notice add to enableMigration function to prevent changing of migration
    ///     target once set
    modifier onlyMigrationEnabledOnce() {
        require(address(_migration) == 0);
        _;
    }

    modifier onlyMigrationEnabled() {
        require(address(_migration) != 0);
        _;
    }

    ////////////////////////
    // Constructor
    ////////////////////////

    function MigrationSource(
        IAccessPolicy policy
    )
        AccessControlled(policy)
    {
    }

    ////////////////////////
    // Public functions
    ////////////////////////

    /// @notice should migrate state that belongs to msg.sender
    /// @dev do not forget to add accessor modifier in implementation
    function migrate()
        onlyMigrationEnabled()
        public;

    /// @notice should enable migration to migration target
    /// @dev do not forget to add accessor modifier in override
    function enableMigration(IMigrationTarget migration)
        public
        only(ROLE_MIGRATION_ADMIN)
        onlyMigrationEnabledOnce()
    {
        // we must be the source
        require(migration.currentMigrationSource() == address(this));
        _migration = migration;
        LogMigrationEnabled(_migration);
    }

    /// @notice returns current migration target
    function currentMigrationTarget()
        public
        constant
        returns (IMigrationTarget)
    {
        return _migration;
    }
}
