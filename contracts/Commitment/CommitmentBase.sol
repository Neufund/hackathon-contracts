pragma solidity 0.4.15;

import '../EtherToken.sol';
import '../LockedAccount.sol';
import '../Math.sol';
import '../Neumark.sol';
import '../Standards/ITokenWithDeposit.sol';
import '../TimeSource.sol';
import './ITokenOffering.sol';
import './MCommitment.sol';
import "../AccessControl/AccessControlled.sol";
import "../Reclaimable.sol";


// Consumes MCommitment
contract CommitmentBase is
    MCommitment,
    AccessControlled,
    TimeSource,
    Math,
    ITokenOffering,
    Reclaimable
{
    ////////////////////////
    // Constants
    ////////////////////////

    // share of Neumark reward platform operator gets
    uint256 private constant NEUMARK_REWARD_PLATFORM_OPERATOR_DIVISOR = 2;

    ////////////////////////
    // Immutable state
    ////////////////////////

    // locks investors capital
    LockedAccount internal LOCKED_ACCOUNT;

    Neumark internal NEUMARK;

    ITokenWithDeposit internal PAYMENT_TOKEN;

    ////////////////////////
    // Mutable state
    ////////////////////////

    //
    // Set only once
    //

    uint256 internal _startDate;

    uint256 internal _endDate;

    uint256 internal _minTicket;

    uint256 internal _minAbsCap;

    uint256 internal _maxAbsCap;

    uint256 internal _ethEURFraction;

    //
    // Mutable
    //

    bool internal _finalized;

    // amount stored in LockedAccount on finalized
    uint256 private _finalCommitedAmount;

    // wallet that keeps Platform Operator share of neumarks
    address private _platformOperatorWallet;

    ////////////////////////
    // Constructor
    ////////////////////////

    /// declare capital commitment into Neufund ecosystem
    /// store funds in _ethToken and lock funds in _lockedAccount while issuing Neumarks along _curve
    /// commitments can be chained via long lived _lockedAccount and _nemark
    function CommitmentBase(
        IAccessPolicy accessPolicy,
        ITokenWithDeposit paymentToken,
        LockedAccount lockedAccount,
        Neumark neumark
    )
        AccessControlled(accessPolicy)
        Reclaimable()
    {
        require(address(paymentToken) == address(lockedAccount.assetToken()));
        require(neumark == lockedAccount.neumark());
        LOCKED_ACCOUNT = lockedAccount;
        NEUMARK = neumark;
        PAYMENT_TOKEN = paymentToken;
    }

    ////////////////////////
    // Public functions
    ////////////////////////

    function setCommitmentTerms(
        uint256 startDate,
        uint256 endDate,
        uint256 minAbsCap,
        uint256 maxAbsCap,
        uint256 minTicket,
        uint256 ethEurFraction,
        address platformOperatorWallet
    )
        public
        // TODO: Access control
    {
        // set only once
        require(_endDate == 0);

        // Validate
        require(startDate > 0);
        require(endDate >= _startDate);
        require(maxAbsCap > 0);
        require(maxAbsCap >= _minAbsCap);
        require(platformOperatorWallet != address(0));

        // Set
        _startDate = startDate;
        _endDate = endDate;
        _minAbsCap = minAbsCap;
        _maxAbsCap = maxAbsCap;
        _minTicket = minTicket;
        _ethEURFraction = ethEurFraction;
        _platformOperatorWallet = platformOperatorWallet;
    }

    function commit()
        public
        payable
    {
        // must control locked account
        require(address(LOCKED_ACCOUNT.controller()) == address(this));

        // must have terms set
        require(_startDate > 0);
        require(currentTime() >= _startDate);
        require(msg.value >= _minTicket);
        require(!hasEnded());
        uint256 total = add(LOCKED_ACCOUNT.totalLockedAmount(), msg.value);

        // we are not sending back the difference - only full tickets
        require(total <= _maxAbsCap);
        require(validCommitment());

        // get neumarks
        uint256 neumarks = giveNeumarks(msg.sender, msg.value);

        // send Money to ETH-T contract
        PAYMENT_TOKEN.deposit.value(msg.value)(address(this), msg.value);

        // make allowance for lock
        PAYMENT_TOKEN.transfer(LOCKED_ACCOUNT, msg.value, bytes(msg.sender));

        // convert weis into euro
        uint256 euroUlps = convertToEUR(msg.value);
        LogFundsInvested(
            msg.sender,
            msg.value,
            PAYMENT_TOKEN,
            euroUlps,
            neumarks,
            NEUMARK
        );
    }

    /// when commitment end criteria are met ANYONE can finalize
    /// can be called only once, not intended for override
    function finalize()
        public
    {
        // must end
        require(hasEnded());

        // must not be finalized
        require(!isFinalized());

        // public commitment ends ETH locking
        if (wasSuccessful()) {
            onCommitmentSuccessful();
            CommitmentCompleted(true);
        } else {
            onCommitmentFailed();
            CommitmentCompleted(false);
        }
        _finalCommitedAmount = LOCKED_ACCOUNT.totalLockedAmount();
        _finalized = true;
    }

    function lockedAccount()
        public
        constant
        returns (LockedAccount)
    {
        return LOCKED_ACCOUNT;
    }

    function paymentToken()
        public
        constant
        returns (ITokenWithDeposit)
    {
        return  PAYMENT_TOKEN;
    }

    function neumark()
        public
        constant
        returns (Neumark)
    {
        return NEUMARK;
    }

    function startDate()
        public
        constant
        returns (uint256)
    {
        return _startDate;
    }

    function endDate()
        public
        constant
        returns (uint256)
    {
        return _endDate;
    }

    function minTicket()
        public
        constant
        returns (uint256)
    {
        return _minTicket;
    }

    function minAbsCap()
        public
        constant
        returns (uint256)
    {
        return _minAbsCap;
    }

    function maxAbsCap()
        public
        constant
        returns (uint256)
    {
        return _maxAbsCap;
    }

    function ethEURFraction()
        public
        constant
        returns (uint256)
    {
        return _ethEURFraction;
    }

    /// overrides TokenOffering
    function wasSuccessful()
        public
        constant
        returns (bool)
    {
        uint256 amount = _finalized ? _finalCommitedAmount : LOCKED_ACCOUNT.totalLockedAmount();
        return amount >= _minAbsCap;
    }

    /// overrides TokenOffering
    function hasEnded()
        public
        constant
        returns(bool)
    {
        uint256 amount = _finalized ? _finalCommitedAmount : LOCKED_ACCOUNT.totalLockedAmount();
        return amount >= _maxAbsCap || currentTime() >= _endDate;
    }

    /// overrides TokenOffering
    function isFinalized()
        public
        constant
        returns (bool)
    {
        return _finalized;
    }

    /// converts `amount` in wei into EUR with 18 decimals required by Curve
    /// Neufund public commitment uses fixed EUR rate during commitment to level playing field and
    /// prevent strategic behavior around ETH/EUR volatility. equity PTOs will use oracles as they need spot prices
    function convertToEUR(uint256 amount)
        public
        constant
        returns (uint256)
    {
        return fraction(amount, _ethEURFraction);
    }

    ////////////////////////
    // Internal functions
    ////////////////////////

    /// distributes neumarks on `this` balance to investor and platform operator: half half
    /// returns amount of investor part
    function distributeAndReturnInvestorNeumarks(address investor, uint256 neumarks)
        internal
        returns (uint256)
    {
        // distribute half half
        uint256 investorNeumarks = divRound(neumarks, NEUMARK_REWARD_PLATFORM_OPERATOR_DIVISOR);

        // @ remco is there a better way to distribute?
        bool isEnabled = NEUMARK.transferEnabled();
        if (!isEnabled)
            NEUMARK.enableTransfer(true);
        require(NEUMARK.transfer(investor, investorNeumarks));
        require(NEUMARK.transfer(_platformOperatorWallet, neumarks - investorNeumarks));
        NEUMARK.enableTransfer(isEnabled);
        return investorNeumarks;
    }
}
