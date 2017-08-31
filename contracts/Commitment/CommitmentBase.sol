pragma solidity 0.4.15;

import '../EtherToken.sol';
import '../LockedAccount.sol';
import '../Math.sol';
import '../Neumark.sol';
import '../Standards/ITokenWithDeposit.sol';
import '../TimeSource.sol';
import './ITokenOffering.sol';
import "../AccessControl/AccessControlled.sol";
import "../Reclaimable.sol";


contract CommitmentBase is AccessControlled, TimeSource, Math, ITokenOffering, Reclaimable {
    // locks investors capital
    LockedAccount public lockedAccount;
    ITokenWithDeposit public paymentToken;
    Neumark public neumark;

    uint256 public startDate;
    uint256 public endDate;

    uint256 public minTicket;
    uint256 public minAbsCap;
    uint256 public maxAbsCap;
    uint256 public ethEURFraction;

    bool public finalized;
    // amount stored in LockedAccount on finalized
    uint256 public finalCommitedAmount;

    // wallet that keeps Platform Operator share of neumarks
    address public platformOperatorWallet;
    // share of Neumark reward platform operator gets
    uint256 public constant neumarkRewardPlatformOperatorDivisor = 2;

    function setCommitmentTerms(
        uint256 _startDate,
        uint256 _endDate,
        uint256 _minAbsCap,
        uint256 _maxAbsCap,
        uint256 _minTicket,
        uint256 _ethEurFraction,
        address _platformOperatorWallet
    )
        public
    {
        // set only once
        require(endDate == 0);
        require(_startDate > 0);
        require(_endDate >= _startDate);
        require(_maxAbsCap > 0);
        require(_maxAbsCap >= _minAbsCap);
        require(_platformOperatorWallet != address(0));

        startDate = _startDate;
        endDate = _endDate;

        minAbsCap = _minAbsCap;
        maxAbsCap = _maxAbsCap;

        minTicket = _minTicket;
        ethEURFraction = _ethEurFraction;
        platformOperatorWallet = _platformOperatorWallet;
    }

    function commit()
        payable
        public
    {
        // must controll locked account
        require(address(lockedAccount.controller()) == address(this));
        // must have terms set
        require(startDate > 0);
        require(currentTime() >= startDate);
        require(msg.value >= minTicket);
        require(!hasEnded());
        uint256 total = add(lockedAccount.totalLockedAmount(), msg.value);
        // we are not sending back the difference - only full tickets
        require(total <= maxAbsCap);
        require(validCommitment());

        // get neumarks
        uint256 neumarks = giveNeumarks(msg.sender, msg.value);
        //send Money to ETH-T contract
        paymentToken.deposit.value(msg.value)(address(this), msg.value);
        // make allowance for lock
        paymentToken.approve(address(lockedAccount), msg.value);
        // lock in lock
        lockedAccount.lock(msg.sender, msg.value, neumarks);
        // convert weis into euro
        uint256 euroUlps = convertToEUR(msg.value);
        FundsInvested(msg.sender, msg.value, paymentToken, euroUlps, neumarks, neumark);
    }

    /// overrides TokenOffering
    function wasSuccessful()
        constant
        public
        returns (bool)
    {
        uint256 amount = finalized ? finalCommitedAmount : lockedAccount.totalLockedAmount();
        return amount >= minAbsCap;
    }

    /// overrides TokenOffering
    function hasEnded()
        constant
        public
        returns(bool)
    {
        uint256 amount = finalized ? finalCommitedAmount : lockedAccount.totalLockedAmount();
        return amount >= maxAbsCap || currentTime() >= endDate;
    }

    /// overrides TokenOffering
    function isFinalized()
        constant
        public
        returns (bool)
    {
        return finalized;
    }

    /// converts `amount` in wei into EUR with 18 decimals required by Curve
    /// Neufund public commitment uses fixed EUR rate during commitment to level playing field and
    /// prevent strategic behavior around ETH/EUR volatility. equity PTOs will use oracles as they need spot prices
    function convertToEUR(uint256 amount)
        public
        constant
        returns (uint256)
    {
        return fraction(amount, ethEURFraction);
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
        finalCommitedAmount = lockedAccount.totalLockedAmount();
        finalized = true;
    }

    /// distributes neumarks on `this` balance to investor and platform operator: half half
    /// returns amount of investor part
    function distributeAndReturnInvestorNeumarks(address investor, uint256 neumarks)
        internal
        returns (uint256)
    {
        // distribute half half
        uint256 investorNeumarks = divRound(neumarks, neumarkRewardPlatformOperatorDivisor);
        // @ remco is there a better way to distribute?
        bool isEnabled = neumark.transferEnabled();
        if (!isEnabled)
            neumark.enableTransfer(true);
        require(neumark.transfer(investor, investorNeumarks));
        require(neumark.transfer(platformOperatorWallet, neumarks - investorNeumarks));
        neumark.enableTransfer(isEnabled);
        return investorNeumarks;
    }

    /// default function not callable. prevent investors without transaction data
    function () { revert(); }

    /// called by finalize() so may be called by ANYONE
    /// intended to be overriden
    function onCommitmentSuccessful() internal;
    /// called by finalize() so may be called by ANYONE
    /// intended to be overriden
    function onCommitmentFailed() internal;
    /// awards investor with Neumarks computed along curve for `amount`
    /// this function modifies state of curve
    /// return amount of investor's Neumark reward
    function giveNeumarks(address investor, uint256 amount) internal returns (uint256);
    /// tells if commitment may be executed ie. investor is whitelisted
    function validCommitment() internal constant returns (bool);

    /// declare capital commitment into Neufund ecosystem
    /// store funds in _ethToken and lock funds in _lockedAccount while issuing Neumarks along _curve
    /// commitments can be chained via long lived _lockedAccount and _nemark
    function CommitmentBase(
        IAccessPolicy accessPolicy,
        EtherToken _ethToken,
        LockedAccount _lockedAccount,
        Neumark _neumark
    )
        AccessControlled(accessPolicy)
        Reclaimable([])
    {
        require(address(_ethToken) == address(_lockedAccount.assetToken()));
        lockedAccount = _lockedAccount;
        neumark = _neumark;
        paymentToken = _ethToken;
    }


}
