pragma solidity 0.4.15;

import './AccessControl/AccessControlled.sol';
import './Math.sol';
import './Reclaimable.sol';
import './Standards/IERC223Token.sol';
import './Standards/IERC223Callback.sol';
import './Standards/IERC677Token.sol';
import './Standards/IERC677Callback.sol';
import './Standards/ITokenWithDeposit.sol';
import './SnapshotToken/Helpers/TokenMetadata.sol';
import './Zeppelin/StandardToken.sol';


contract EtherToken is
    ITokenWithDeposit,
    IERC223Token,
    IERC677Token,
    AccessControlled,
    StandardToken,
    TokenMetadata,
    Reclaimable
{
    ////////////////////////
    // Constants
    ////////////////////////

    string private constant NAME = "Ether Token";

    string private constant SYMBOL = "ETH-T";

    uint8 private constant DECIMALS = 18;

    ////////////////////////
    // Constructor
    ////////////////////////

    function EtherToken(IAccessPolicy accessPolicy)
        AccessControlled(accessPolicy)
        StandardToken()
        TokenMetadata(NAME, DECIMALS, SYMBOL, "")
        Reclaimable()
    {
    }

    ////////////////////////
    // Public functions
    ////////////////////////

    /// deposit 'amount' of Ether to account 'to'
    function deposit(address to, uint256 amount)
        payable
        public
        returns (bool)
    {
        // must have as much ether as declared
        require(msg.value == amount);
        _balances[to] = add(_balances[to], amount);
        _totalSupply = add(_totalSupply, amount);
        Deposit(to, amount);
        return true;
    }

    /// withdraws and sends 'amount' of ether to msg.sender
    function withdraw(uint256 amount)
        public
    {
        require(_balances[msg.sender] >= amount);
        _balances[msg.sender] -= amount;
        _totalSupply -= amount;
        msg.sender.transfer(amount);
        Withdrawal(msg.sender, amount);
    }

    //
    // Implements IERC677Token
    //

    function transfer(address to, uint256 amount, bytes data)
        public
        returns (bool success)
    {
        success = transfer(msg.sender, to, amount);
        if (!success) {
            return success;
        }

        // Notify the receiving contract.
        if (isContract(to)) {
            IERC223Callback(to).tokenFallback(msg.sender, amount, data);
        }
        return success;
    }

    //
    // Implements IERC677Token
    //

    function approveAndCall(address spender, uint256 amount, bytes extraData)
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

    //
    // Overrides Reclaimable
    //

    function reclaim(IBasicToken token)
        public
    {
        // This contract holds Ether
        require(token != RECLAIM_ETHER);
        Reclaimable.reclaim(token);
    }
}
