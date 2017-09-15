pragma solidity 0.4.15;

import './AccessControl/AccessControlled.sol';
import './Math.sol';
import './Reclaimable.sol';
import './Standards/IERC677Token.sol';
import './Standards/IERC677Callback.sol';
import './Standards/ITokenWithDeposit.sol';
import './SnapshotToken/Helpers/TokenMetadata.sol';
import './Zeppelin/StandardToken.sol';
import './MigrationSource.sol';
import './EuroTokenMigrationTarget.sol';


/// Simple implementation of EuroToken which is pegged 1:1 to certain off-chain
/// pool of Euro. Balances of this token are intended to be migrated to final
/// implementation that will be available later
contract EuroToken is
    ITokenWithDeposit,
    IERC677Token,
    AccessControlled,
    StandardToken,
    TokenMetadata,
    MigrationSource,
    Reclaimable
{
    ////////////////////////
    // Constants
    ////////////////////////

    string private constant NAME = "Euro Token";

    string private constant SYMBOL = "EUR-T";

    uint8 private constant DECIMALS = 18;

    ////////////////////////
    // Mutable state
    ////////////////////////

    // a list of addresses that are allowed to receive EUR-T
    mapping(address => bool) private _allowedTransferTo;

    // a list of of addresses that are allowed to send EUR-T
    mapping(address => bool) private _allowedTransferFrom;

    ////////////////////////
    // Events
    ////////////////////////

    event LogAllowedFromAddress(
        address indexed from,
        bool allowed
    );

    event LogAllowedToAddress(
        address indexed to,
        bool allowed
    );

    /// @notice logged on successful migration
    event LogOwnerMigrated(
        address indexed owner,
        uint256 amount
    );

    ////////////////////////
    // Modifiers
    ////////////////////////

    modifier onlyAllowedTransferFrom(address from) {
        require(_allowedTransferFrom[from]);
        _;
    }

    modifier onlyAllowedTransferTo(address to) {
        require(_allowedTransferTo[to]);
        _;
    }

    ////////////////////////
    // Constructor
    ////////////////////////

    function EuroToken(IAccessPolicy accessPolicy)
        AccessControlled(accessPolicy)
        StandardToken()
        TokenMetadata(NAME, DECIMALS, SYMBOL, "")
        MigrationSource(accessPolicy)
        Reclaimable()
    {
    }

    ////////////////////////
    // Public functions
    ////////////////////////

    /// @notice deposit 'amount' of EUR-T to address 'to'
    /// @dev address 'to' is whitelisted as recipient of future transfers
    /// @dev deposit may happen only in case of succesful KYC of recipient and validation of banking data
    /// @dev which in this implementation is an off-chain responsibility of EURT_DEPOSIT_MANAGER
    function deposit(address to, uint256 amount)
        public
        payable
        only(ROLE_EURT_DEPOSIT_MANAGER)
        returns (bool)
    {
        // cannot receive ether
        require(msg.value == 0);
        _balances[to] = add(_balances[to], amount);
        _totalSupply = add(_totalSupply, amount);
        setAllowedTransferTo(to, true);
        LogDeposit(to, amount);
        return true;
    }

    /// @notice withdraws 'amount' of EUR-T by burning required amount and providing a proof of whithdrawal
    /// @dev proof is provided in form of log entry on which EURT_DEPOSIT_MANAGER
    /// @dev will act off-chain to return required Euro amount to EUR-T holder
    function withdraw(uint256 amount)
        public
    {
        require(_balances[msg.sender] >= amount);
        _balances[msg.sender] -= amount;
        _totalSupply -= amount;
        LogWithdrawal(msg.sender, amount);
    }

    /// @notice enables or disables address to be receipient of EUR-T
    function setAllowedTransferTo(address to, bool allowed)
        public
        only(ROLE_EURT_DEPOSIT_MANAGER)
    {
        _allowedTransferTo[to] = allowed;
        LogAllowedToAddress(to, allowed);
    }

    /// @notice enables or disables address to be sender of EUR-T
    function setAllowedTransferFrom(address from, bool allowed)
        public
        only(ROLE_EURT_DEPOSIT_MANAGER)
    {
        _allowedTransferFrom[from] = allowed;
        LogAllowedFromAddress(from, allowed);
    }

    function allowedTransferTo(address to)
        public
        constant
        returns (bool)
    {
        return _allowedTransferTo[to];
    }

    function allowedTransferFrom(address from)
        public
        constant
        returns (bool)
    {
        return _allowedTransferFrom[from];
    }

    //
    // Overrides ERC20 Interface to allow transfer from/to allowed addresses
    //

    function transfer(address to, uint256 amount)
        public
        onlyAllowedTransferFrom(msg.sender)
        onlyAllowedTransferTo(to)
        returns (bool success)
    {
        return BasicToken.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount)
        public
        onlyAllowedTransferFrom(from)
        onlyAllowedTransferTo(to)
        returns (bool success)
    {
        return StandardToken.transferFrom(from, to, amount);
    }

    //
    // Overrides migration source
    //

    function migrate()
        public
        onlyMigrationEnabled()
        onlyAllowedTransferTo(msg.sender)
    {
        // burn deposit
        uint256 amount = _balances[msg.sender];
        require(amount > 0);
        _balances[msg.sender] = 0;
        _totalSupply -= amount;
        // migrate to
        bool success = EuroTokenMigrationTarget(_migration).migrateOwner(msg.sender, amount);
        require(success);
        // set event
        LogOwnerMigrated(msg.sender, amount);
    }

    //
    // Implements IERC677Token
    //

    function approveAndCall(address spender, uint256 amount, bytes extraData)
        public
        returns (bool success)
    {
        require(approve(spender, amount));

        success = IERC677Callback(spender).receiveApproval(
            msg.sender,
            amount,
            this,
            extraData
        );

        return success;
    }
}
