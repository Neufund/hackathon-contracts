pragma solidity 0.4.15;

contract AccessRoles {

    // may setup LockedAccount, change disbursal mechanism and set migration
    bytes32 public constant ROLE_LOCKED_ACCOUNT_ADMIN = keccak256("LockedAccountAdmin");

    // may setup whitelists and abort whitelisting contract with curve rollback
    bytes32 public constant ROLE_WHITELIST_ADMIN = keccak256("WhitelistAdmin");

    bytes32 public constant ROLE_NEUMARK_ISSUER = keccak256("NeumarkIssuer");
    bytes32 public constant ROLE_NEUMARK_BURNER = keccak256("NeumarkBurner");
    bytes32 public constant ROLE_TRANSFERS_ADMIN = keccak256("TransferAdmin");
    bytes32 public constant ROLE_SNAPSHOT_CREATOR = keccak256("SnapshotCreator");

    bytes32 public constant ROLE_RECLAIMER = keccak256("Reclaimer");

    bytes32 public constant ROLE_FORK_ARBITER = keccak256("ForkArbiter");
}
