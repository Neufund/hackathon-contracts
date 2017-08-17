pragma solidity ^0.4.11;

contract StandardRoles {

    // NOTE: Soldity somehow doesn't evaluate this compile time
    bytes32 public constant ROLE_ACCESS_CONTROLER = keccak256("AccessControler");
    bytes32 public constant ROLE_ADMINISTRATOR = keccak256("Administrator");
}
