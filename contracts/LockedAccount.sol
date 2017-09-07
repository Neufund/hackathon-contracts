pragma solidity 0.4.15;

import './AccessControl/AccessControlled.sol';
import './AccessRoles.sol';
import './Agreement.sol';
import './Commitment/ITokenOffering.sol';
import './EtherToken.sol';
import './IsContract.sol';
import './LockedAccountMigration.sol';
import './Neumark.sol';
import './Standards/IERC223Token.sol';
import './Standards/IERC223Callback.sol';
import './Reclaimable.sol';
import './ReturnsErrors.sol';
import './TimeSource.sol';


contract LockedAccount is
    AccessControlled,
    AccessRoles,
    Agreement,
    TimeSource,
    ReturnsErrors,
    Math,
    IsContract,
    IERC223Callback,
    Reclaimable
{

    ////////////////////////
    // Type declarations
    ////////////////////////

    // lock state
    enum LockState {
        Uncontrolled,
        AcceptingLocks,
        AcceptingUnlocks,
        ReleaseAll
    }

    struct Account {
        uint256 balance;
        uint256 neumarksDue;
        uint256 unlockDate;
    }

    ////////////////////////
    // Immutable state
    ////////////////////////

    // a token controlled by LockedAccount, read ERC20 + extensions to read what
    // token is it (ETH/EUR etc.)
    IERC677Token private ASSET_TOKEN;

    Neumark private NEUMARK;

    // longstop period in seconds
    uint private LOCK_PERIOD;

    // penalty: fraction of stored amount on escape hatch
    uint private PENALTY_FRACTION;

    ////////////////////////
    // Mutable state
    ////////////////////////

    // total amount of tokens locked
    uint private _totalLockedAmount;

    // total number of locked investors
    uint internal _totalInvestors;

    // current state of the locking contract
    LockState private _lockState;

    // govering ICO contract that may lock money or unlock all account if fails
    ITokenOffering private _controller;

    // fee distribution pool
    address private _penaltyDisbursalAddress;

    // migration target contract
    LockedAccountMigration private _migration;

    // LockedAccountMigration private migration;
    mapping(address => Account) internal _accounts;

    ////////////////////////
    // Events
    ////////////////////////

    event FundsLocked(
        address indexed investor,
        uint256 amount,
        uint256 neumarks
    );

    event FundsUnlocked(
        address indexed investor,
        uint256 amount
    );

    event PenaltyDisbursed(
        address indexed investor,
        uint256 amount,
        address toPool
    );

    event LockStateTransition(
        LockState oldState,
        LockState newState
    );

    event InvestorMigrated(
        address indexed investor,
        uint256 amount,
        uint256 neumarks,
        uint256 unlockDate
    );

    event MigrationEnabled(
        address target
    );

    ////////////////////////
    // Modifiers
    ////////////////////////

    modifier onlyController() {
        require(msg.sender == address(_controller));
        _;
    }

    modifier onlyState(LockState state) {
        require(_lockState == state);
        _;
    }

    modifier onlyStates(LockState state1, LockState state2) {
        require(_lockState == state1 || _lockState == state2);
        _;
    }

    ////////////////////////
    // Constructor
    ////////////////////////

    // _assetToken - token contract with resource locked by LockedAccount, where
    // LockedAccount is allowed to make deposits
    function LockedAccount(
        IAccessPolicy policy,
        IEthereumForkArbiter forkArbiter,
        string agreementUri,
        IERC677Token assetToken,
        Neumark neumark,
        uint lockPeriod,
        uint penaltyFraction
    )
        AccessControlled(policy)
        Agreement(forkArbiter, agreementUri)
        Reclaimable()
    {
        require(assetToken != 0x0);
        require(neumark != 0x0);
        require(assetToken != neumark);
        ASSET_TOKEN = assetToken;
        NEUMARK = neumark;
        LOCK_PERIOD = lockPeriod;
        PENALTY_FRACTION = penaltyFraction;
    }

    ////////////////////////
    // Public functions
    ////////////////////////

    // deposits 'amount' of tokens on assetToken contract
    // locks 'amount' for 'investor' address
    // callable only from ICO contract that gets currency directly (ETH/EUR)
    function lock(address investor, uint256 amount, uint256 neumarks)
        public
        onlyState(LockState.AcceptingLocks)
        onlyController()
        acceptAgreement(investor)
    {
        require(amount > 0);

        // check if controller made allowance
        require(ASSET_TOKEN.allowance(msg.sender, address(this)) >= amount);

        // transfer to self yourself
        require(ASSET_TOKEN.transferFrom(msg.sender, address(this), amount));

        Account storage a = _accounts[investor];
        a.balance = addBalance(a.balance, amount);
        a.neumarksDue += neumarks;
        assert(isSafeMultiplier(a.neumarksDue));
        if (a.unlockDate == 0) {

            // this is new account - unlockDate always > 0
            _totalInvestors += 1;
            a.unlockDate = currentTime() + LOCK_PERIOD;
        }
        _accounts[investor] = a;
        FundsLocked(investor, amount, neumarks);
    }

    /// allows to anyone to release all funds without burning Neumarks and any
    /// other penalties
    function controllerFailed()
        public
        onlyState(LockState.AcceptingLocks)
        onlyController()
    {
        changeState(LockState.ReleaseAll);
    }

    /// allows anyone to use escape hatch
    function controllerSucceeded()
        public
        onlyState(LockState.AcceptingLocks)
        onlyController()
    {
        changeState(LockState.AcceptingUnlocks);
    }

    /// enables migration to new LockedAccount instance
    /// it can be set only once to prevent setting temporary migrations that let
    /// just one investor out
    /// may be set in AcceptingLocks state (in unlikely event that controller
    /// fails we let investors out)
    /// and AcceptingUnlocks - which is normal operational mode
    function enableMigration(LockedAccountMigration migration)
        public
        only(ROLE_LOCKED_ACCOUNT_ADMIN)
        onlyStates(LockState.AcceptingLocks, LockState.AcceptingUnlocks)
    {
        require(address(_migration) == 0);

        // we must be the source
        require(migration.getMigrationFrom() == address(this));
        _migration = migration;
        MigrationEnabled(_migration);
    }

    /// migrate single investor
    function migrate()
        public
    {
        require(address(_migration) != 0);

        // migrates
        Account memory a = _accounts[msg.sender];

        // if there is anything to migrate
        if (a.balance > 0) {

            // this will clear investor storage
            removeInvestor(msg.sender, a.balance);

            // let migration target to own asset balance that belongs to investor
            require(ASSET_TOKEN.approve(address(_migration), a.balance));
            bool migrated = _migration.migrateInvestor(
                msg.sender,
                a.balance,
                a.neumarksDue,
                a.unlockDate
            );
            assert(migrated);
            InvestorMigrated(msg.sender, a.balance, a.neumarksDue, a.unlockDate);
        }
    }

    function setController(ITokenOffering controller)
        public
        only(ROLE_LOCKED_ACCOUNT_ADMIN)
        onlyStates(LockState.Uncontrolled, LockState.AcceptingLocks)
    {
        // do not let change controller that didn't yet finished
        if (address(_controller) != 0) {
            require(_controller.isFinalized());
        }
        _controller = controller;
        changeState(LockState.AcceptingLocks);
    }

    /// sets address to which tokens from unlock penalty are sent
    /// both simple addresses and contracts are allowed
    /// contract needs to implement ApproveAndCallCallback interface
    function setPenaltyDisbursal(address penaltyDisbursalAddress)
        public
        only(ROLE_LOCKED_ACCOUNT_ADMIN)
    {
        require(penaltyDisbursalAddress != address(0));

        // can be changed at any moment by admin
        _penaltyDisbursalAddress = penaltyDisbursalAddress;
    }

    function assetToken()
        public
        constant
        returns (IERC677Token)
    {
        return ASSET_TOKEN;
    }

    function neumark()
        public
        constant
        returns (Neumark)
    {
        return NEUMARK;
    }

    function lockPeriod()
        public
        constant
        returns (uint256)
    {
        return LOCK_PERIOD;
    }

    function penaltyFraction()
        public
        constant
        returns (uint256)
    {
        return PENALTY_FRACTION;
    }

    function balanceOf(address investor)
        public
        constant
        returns (uint256, uint256, uint256)
    {
        Account storage a = _accounts[investor];
        return (a.balance, a.neumarksDue, a.unlockDate);
    }

    function controller()
        public
        constant
        returns (address)
    {
        return _controller;
    }

    function lockState()
        public
        constant
        returns (LockState)
    {
        return _lockState;
    }

    function totalLockedAmount()
        public
        constant
        returns (uint256)
    {
        return _totalLockedAmount;
    }

    function totalInvestors()
        public
        constant
        returns (uint256)
    {
        return _totalInvestors;
    }

    function penaltyDisbursalAddress()
        public
        constant
        returns (address)
    {
        return _penaltyDisbursalAddress;
    }

    //
    // Overides Reclaimable
    //

    function reclaim(IBasicToken token)
        public
    {
        // This contract holds the asset token
        require(token != ASSET_TOKEN);
        Reclaimable.reclaim(token);
    }

    //
    // Implements IERC223Callback
    //

    // this allows to unlock and allow neumarks to be burned in one transaction
    function tokenFallback(
        address from,
        uint256 amount,
        bytes data
    )
        public
        onlyStates(LockState.AcceptingUnlocks, LockState.ReleaseAll)
    {
        require(amount > 0);

        if (msg.sender == ASSET_TOKEN) {
            require(msg.sender == _controller);
            require(data.length == 20);
            address investor = address(data);
            uint256 neumarks = ...;
            lock(investor, amount, neumarks);
            return;
        }

        if (msg.sender == NEUMARK) {
            receivedNeumarks(from, amount);
            return;
        }

        revert();
    }

    ////////////////////////
    // Internal functions
    ////////////////////////

    function receivedAssets(address from, uint256 amount)
        private
        onlyState(LockState.AcceptingLocks)
        acceptAgreement(from)
    {
        require(amount > 0);

        Account storage a = _accounts[investor];
        a.balance = addBalance(a.balance, amount);
        a.neumarksDue += neumarks;
        assert(isSafeMultiplier(a.neumarksDue));
        if (a.unlockDate == 0) {

            // this is new account - unlockDate always > 0
            _totalInvestors += 1;
            a.unlockDate = currentTime() + LOCK_PERIOD;
        }
        _accounts[investor] = a;
        LogFundsLocked(investor, amount, neumarks);
    }


    function receivedNeumarks(address from, uint256 amount)
        private
    {
        require(msg.sender == address(NEUMARK));
        require(amount == _accounts[investor].neumarksDue);

        // this will check if amount is enough to unlock
        require(unlockFor(from) == Status.SUCCESS);
    }


    function addBalance(uint256 balance, uint256 amount)
        internal
        returns (uint)
    {
        _totalLockedAmount = add(_totalLockedAmount, amount);
        uint256 newBalance = add(balance, amount);
        assert(isSafeMultiplier(newBalance));
        return newBalance;
    }

    function subBalance(uint balance, uint amount)
        internal
        returns (uint)
    {
        _totalLockedAmount -= amount;
        return balance - amount;
    }

    function removeInvestor(address investor, uint256 balance)
        internal
    {
        _totalLockedAmount -= balance;
        _totalInvestors -= 1;
        delete _accounts[investor];
    }

    function changeState(LockState newState)
        internal
    {
        if (newState != _lockState) {
            LockStateTransition(_lockState, newState);
            _lockState = newState;
        }
    }

    function unlockFor(address investor)
        internal
        returns (Status)
    {
        Account storage a = _accounts[investor];

        // if there is anything to unlock
        if (a.balance > 0) {

            // in ReleaseAll just give money back by transfering to investor
            if (_lockState == LockState.AcceptingUnlocks) {

                // burn neumarks corresponding to unspent funds
                NEUMARK.burnNeumark(a.neumarksDue);

                // take the penalty if before unlockDate
                if (currentTime() < a.unlockDate) {
                    require(_penaltyDisbursalAddress != address(0));
                    uint256 penalty = fraction(a.balance, PENALTY_FRACTION);

                    // distribute penalty
                    if (isContract(_penaltyDisbursalAddress)) {

                        // transfer to contract
                        require(
                            ASSET_TOKEN.transfer(
                                _penaltyDisbursalAddress,
                                penalty,
                                bytes()
                            )
                        );
                    } else {

                        // transfer to address
                        require(ASSET_TOKEN.transfer(_penaltyDisbursalAddress, penalty));
                    }
                    PenaltyDisbursed(investor, penalty, _penaltyDisbursalAddress);
                    a.balance = subBalance(a.balance, penalty);
                }
            }

            // transfer amount back to investor - now it can withdraw
            require(ASSET_TOKEN.transfer(investor, a.balance));

            // remove balance, investor and
            FundsUnlocked(investor, a.balance);
            removeInvestor(investor, a.balance);
        }
        return Status.SUCCESS;
    }
}
