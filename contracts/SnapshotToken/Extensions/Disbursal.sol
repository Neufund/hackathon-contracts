pragma solidity 0.4.15;

import '../../Standards/ISnapshotableToken.sol';
import '../../Standards/IBasicToken.sol';
import '../../Standards/IERC20Token.sol';
import '../../Standards/IERC223Callback.sol';


// TODO: Anyone can create a token and disburse it, but then everyone
//       needs to pay extra gas for claim(). It is not possible to skip
//       these mallicious disbursals. Some solution strategies:
//        * Limit the people who can disburse to a trusted set
//        * Allow claims in any order
contract Disbursal is IERC223Callback {

    ////////////////////////
    // Types
    ////////////////////////

    struct Disbursment {
        uint256 snapshot;
        IBasicToken disbursedToken;
        uint256 remainingAmount;
        uint256 remainingShares;
    }

    ////////////////////////
    // Immutabel state
    ////////////////////////

    ISnapshotableToken private SHARE_TOKEN;

    ////////////////////////
    // Mutable state
    ////////////////////////

    Disbursment[] private _disbursments;

    mapping(address => mapping(uint256 => bool)) private _claimed;

    ////////////////////////
    // Events
    ////////////////////////

    event Disbursed(
        uint256 disbursalIndex,
        IBasicToken disbursedToken,
        uint256 amount,
        uint256 snapshot,
        uint256 totalShares
    );

    event Claimed(
        address beneficiary,
        uint256 disbursalIndex,
        IBasicToken disbursedToken,
        uint256 amount
    );

    ////////////////////////
    // Constructor
    ////////////////////////

    function Disbursal(
        ISnapshotableToken shareToken
    )
        public
    {
        SHARE_TOKEN = shareToken;
    }

    ////////////////////////
    // Public functions
    ////////////////////////

    function claimables(address beneficiary, uint256 from)
        public
        constant
        returns (uint256[100])
    {
        uint256[100] memory result;
        uint j = 0;
        for (uint256 i = from; i < _disbursments.length; ++i) {
            if (claimable(beneficiary, i)) {
                result[j] = i;
                j += 1;
                if (j == 100) {
                    break;
                }
            }
        }
        return  result;
    }

    function claimable(address beneficiary, uint256 index)
        public
        constant
        returns (bool)
    {
        // Invalid index
        if(index >= _disbursments.length) {
            return false;
        }

        // Already claimed
        if(_claimed[beneficiary][index] == true) {
            return false;
        }

        // Check if `beneficiary` has shares
        Disbursment storage disbursment = _disbursments[index];
        uint256 shares = SHARE_TOKEN.balanceOfAt(beneficiary, disbursment.snapshot);
        return  shares > 0;
    }

    function claim()
        public
    {
        claim(msg.sender);
    }

    function claim(address beneficiary)
        public
    {
        for(uint256 i = 0; i < _disbursments.length; ++i) {
            if(_claimed[beneficiary][i] == false) {
                claim(beneficiary, i);
            }
        }
    }

    function claim(address beneficiary, uint256[] indices)
        public
    {
        for(uint256 i = 0; i < indices.length; ++i) {
            claim(beneficiary, indices[i]);
        }
    }

    function claim(address beneficiary, uint256 index)
        public
    {
        require(index < _disbursments.length);
        require(_claimed[beneficiary][index] == false);

        // Compute share
        // NOTE: By mainting both remaining counters we have automatic
        //       distribution of rounding errors between claims, with the
        //       final claim being exact and issuing all the remaining tokens.
        // TODO: Remove < 2¹²⁸ restrictions
        // TODO: Correct rounding instead of floor.
        Disbursment storage disbursment = _disbursments[index];
        uint256 shares = SHARE_TOKEN.balanceOfAt(beneficiary, disbursment.snapshot);
        assert(disbursment.remainingShares < 2**128);
        assert(disbursment.remainingAmount < 2**128);
        assert(shares <= disbursment.remainingShares);
        uint256 amount = mulDiv(disbursment.remainingAmount, shares, disbursment.remainingShares);
        assert(amount <= disbursment.remainingAmount);

        // Update state
        // TODO: Can we reduce the number of state writes?
        disbursment.remainingAmount -= amount;
        disbursment.remainingShares -= shares;
        _claimed[beneficiary][index] = true;

        // Transfer tokens
        IBasicToken token = disbursment.disbursedToken;
        bool success = token.transfer(beneficiary, amount);
        require(success);

        // Log and return
        Claimed(beneficiary, index, token, amount);
    }

    function shareToken()
        public
        constant
        returns (ISnapshotableToken)
    {
        return SHARE_TOKEN;
    }


    //
    // Implements IERC223Callback
    //

    function tokenFallback(
        address from,
        uint256 amount,
        bytes data
    )
        public
        returns (bool)
    {
        require(data.length == 0);
        disburse(IBasicToken(msg.sender), amount);
    }

    ////////////////////////
    // Internal functions
    ////////////////////////

    // TODO: Ideally we make this function public, and allow
    //       disbursal of any basic token. When counting how
    //       many tokens we need to disburse, a simple
    //       `balanceOf(this)` is insufficient, as it also
    //       contains the remaining amount from previous disbursments.
    function disburse(IBasicToken token, uint256 amount)
        internal
    {
        require(amount > 0);
        require(amount < 2**128);
        require(token.balanceOf(this) >= amount);

        // Create snapshot
        uint256 snapshot = SHARE_TOKEN.createSnapshot();
        uint256 totalShares = SHARE_TOKEN.totalSupplyAt(snapshot);
        require(totalShares < 2**128);

        // Create disbursal
        uint256 index = _disbursments.length;
        _disbursments.push(
            Disbursment({
                snapshot: snapshot,
                disbursedToken: token,
                remainingAmount: amount,
                remainingShares: totalShares
            })
        );

        // Log
        Disbursed(index, token, amount, snapshot, totalShares);
    }

    function mulDiv(
        uint256 value,
        uint256 numerator,
        uint256 denominator
    )
        internal
        constant
        returns (uint256)
    {
        require(value < 2**128);
        require(numerator < 2**128);
        require(numerator <= denominator);
        return (value * numerator) / denominator;
    }
}
