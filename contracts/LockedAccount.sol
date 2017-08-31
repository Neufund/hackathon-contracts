pragma solidity 0.4.15;

import './IsContract.sol';
import './AccessControl/AccessControlled.sol';
import './AccessRoles.sol';
import './ReturnsErrors.sol';
import './TimeSource.sol';
import './EtherToken.sol';
import './Neumark.sol';
import './Commitment/ITokenOffering.sol';
import './LockedAccountMigration.sol';
import './Standards/IERC667Token.sol';
import './Standards/IERC667Callback.sol';
import './Reclaimable.sol';

contract LockedAccount is AccessControlled, AccessRoles, TimeSource, ReturnsErrors, Math, IsContract, IERC667Callback, Reclaimable {
    // lock state
    enum LockState {Uncontrolled, AcceptingLocks, AcceptingUnlocks, ReleaseAll }

    // events
    event FundsLocked(address indexed investor, uint256 amount, uint256 neumarks);
    event FundsUnlocked(address indexed investor, uint256 amount);
    event PenaltyDisbursed(address indexed investor, uint256 amount, address toPool);
    event LockStateTransition(LockState oldState, LockState newState);
    event InvestorMigrated(address indexed investor, uint256 amount, uint256 neumarks, uint256 unlockDate);
    event MigrationEnabled(address target);

    // total amount of tokens locked
    uint public totalLockedAmount;
    // total number of locked investors
    uint public totalInvestors;
    // a token controlled by LockedAccount, read ERC20 + extensions to read what token is it (ETH/EUR etc.)
    IERC667Token public assetToken;
    // current state of the locking contract
    LockState public lockState;
    // longstop period in seconds
    uint public lockPeriod;
    // penalty: fraction of stored amount on escape hatch
    uint public penaltyFraction;
    // govering ICO contract that may lock money or unlock all account if fails
    ITokenOffering public controller;
    // fee distribution pool
    address public penaltyDisbursalAddress;
    // migration target contract
    LockedAccountMigration public migration;


    Neumark internal neumark;
    // LockedAccountMigration private migration;
    mapping(address => Account) internal accounts;

    struct Account {
        uint256 balance;
        uint256 neumarksDue;
        uint256 unlockDate;
    }

    //modifiers
    modifier onlycontroller {
        require(msg.sender == address(controller));
        _;
    }

    modifier onlyState(LockState state) {
        require(lockState == state);
        _;
    }

    modifier onlyStates(LockState state1, LockState state2) {
        require(lockState == state1 || lockState == state2);
        _;
    }

    // deposits 'amount' of tokens on assetToken contract
    // locks 'amount' for 'investor' address
    // callable only from ICO contract that gets currency directly (ETH/EUR)
    function lock(address investor, uint256 amount, uint256 neumarks)
        onlycontroller
        onlyState(LockState.AcceptingLocks)
        public
    {
        require(amount > 0);
        // check if controller made allowance
        require(assetToken.allowance(msg.sender, address(this)) >= amount);
        // transfer to self yourself
        require(assetToken.transferFrom(msg.sender, address(this), amount));
        Account storage a = accounts[investor];
        a.balance = _addBalance(a.balance, amount);
        a.neumarksDue += neumarks;
        assert(isSafeMultiplier(a.neumarksDue));
        if (a.unlockDate == 0) {
            // this is new account - unlockDate always > 0
            totalInvestors += 1;
            a.unlockDate = currentTime() + lockPeriod;
        }
        accounts[investor] = a;
        FundsLocked(investor, amount, neumarks);
    }

    function unlockFor(address investor)
        internal
        returns (Status)
    {
        Account storage a = accounts[investor];
        // if there is anything to unlock
        if (a.balance > 0) {
            // in ReleaseAll just give money back by transfering to investor
            if (lockState == LockState.AcceptingUnlocks) {
                // before burn happens, investor must make allowance to locked account
                if (neumark.allowance(investor, address(this)) < a.neumarksDue) {
                    return logError(Status.NOT_ENOUGH_NEUMARKS_TO_UNLOCK);
                }
                if (!neumark.transferFrom(investor, address(this), a.neumarksDue)) {
                    return logError(Status.NOT_ENOUGH_NEUMARKS_TO_UNLOCK);
                }
                // burn neumarks corresponding to unspent funds
                neumark.burnNeumark(a.neumarksDue);
                // take the penalty if before unlockDate
                if (currentTime() < a.unlockDate) {
                    uint256 penalty = fraction(a.balance, penaltyFraction);
                    // distribute penalty
                    if (isContract(penaltyDisbursalAddress)) {
                        // transfer to contract
                        require(assetToken.approveAndCall(penaltyDisbursalAddress, penalty, ""));
                    } else {
                        // transfer to address
                        require(assetToken.transfer(penaltyDisbursalAddress, penalty));
                    }
                    PenaltyDisbursed(investor, penalty, penaltyDisbursalAddress);
                    a.balance = _subBalance(a.balance, penalty);
                }
            }
            // transfer amount back to investor - now it can withdraw
            require(assetToken.transfer(investor, a.balance));
            // remove balance, investor and
            FundsUnlocked(investor, a.balance);
            _removeInvestor(investor, a.balance);
        }
        return Status.SUCCESS;
    }

    // unlocks msg.sender tokens by making them withdrawable in assetToken
    // expects number of neumarks that is due to be available to be burned on msg.sender balance - see comments
    // if used before longstop date, calculates penalty and distributes it as revenue
    function unlock()
        onlyStates(LockState.AcceptingUnlocks, LockState.ReleaseAll)
        public
        returns (Status)
    {
        return unlockFor(msg.sender);
    }

    // this allows to unlock and allow neumarks to be burned in one transaction
    function receiveApproval(address from, uint256 _amount, address _token, bytes _data)
        onlyStates(LockState.AcceptingUnlocks, LockState.ReleaseAll)
        public
        returns (bool)
    {
        require(_data.length == 0);
        // only from neumarks
        require(_token == address(neumark));
        // this will check if allowance was made and if _amount is enough to unlock
        unlockFor(from);
        return true;
    }

    function balanceOf(address investor)
        constant
        public
        returns (uint256, uint256, uint256)
    {
        Account storage a = accounts[investor];
        return (a.balance, a.neumarksDue, a.unlockDate);
    }

    /// allows to anyone to release all funds without burning Neumarks and any other penalties
    function controllerFailed()
        onlyState(LockState.AcceptingLocks)
        onlycontroller
        public
    {
        _changeState(LockState.ReleaseAll);
    }

    /// allows anyone to use escape hatch
    function controllerSucceeded()
        onlyState(LockState.AcceptingLocks)
        onlycontroller
        public
    {
        _changeState(LockState.AcceptingUnlocks);
    }

    /// enables migration to new LockedAccount instance
    /// it can be set only once to prevent setting temporary migrations that let
    /// just one investor out
    /// may be set in AcceptingLocks state (in unlikely event that controller fails we let investors out)
    /// and AcceptingUnlocks - which is normal operational mode
    function enableMigration(LockedAccountMigration _migration)
        only(ROLE_LOCKED_ACCOUNT_ADMIN)
        onlyStates(LockState.AcceptingLocks, LockState.AcceptingUnlocks)
        public
    {
        require(address(migration) == 0);
        // we must be the source
        require(_migration.getMigrationFrom() == address(this));
        migration = _migration;
        MigrationEnabled(_migration);
    }

    /// migrate single investor
    function migrate()
        public
    {
        require(address(migration) != 0);
        // migrates
        Account storage a = accounts[msg.sender];
        // if there is anything to migrate
        if (a.balance > 0) {
            bool migrated = migration.migrateInvestor(msg.sender, a.balance, a.neumarksDue, a.unlockDate);
            assert(migrated);
            InvestorMigrated(msg.sender, a.balance, a.neumarksDue, a.unlockDate);
            _removeInvestor(msg.sender, a.balance);
        }
    }

    function setController(ITokenOffering _controller)
        only(ROLE_LOCKED_ACCOUNT_ADMIN)
        onlyStates(LockState.Uncontrolled, LockState.AcceptingLocks)
        public
    {
        // do not let change controller that didn't yet finished
        if (address(controller) != 0)
            require(controller.isFinalized());
        controller = _controller;
        _changeState(LockState.AcceptingLocks);
    }

    /// sets address to which tokens from unlock penalty are sent
    /// both simple addresses and contracts are allowed
    /// contract needs to implement ApproveAndCallCallback interface
    function setPenaltyDisbursal(address _penaltyDisbursalAddress)
        only(ROLE_LOCKED_ACCOUNT_ADMIN)
        public
    {
        // can be changed at any moment by owner
        penaltyDisbursalAddress = _penaltyDisbursalAddress;
    }

    // _assetToken - token contract with resource locked by LockedAccount, where LockedAccount is allowed to make deposits
    //
    function LockedAccount(IAccessPolicy _policy, IERC667Token _assetToken, Neumark _neumark,
        uint _lockPeriod, uint _penaltyFraction)
        AccessControlled(_policy)
        Reclaimable([_assetToken])
    {
        assetToken = _assetToken;
        neumark = _neumark;
        lockPeriod = _lockPeriod;
        penaltyFraction = _penaltyFraction;
    }

    function _addBalance(uint balance, uint amount) internal returns (uint) {
        totalLockedAmount = add(totalLockedAmount, amount);
        uint256 newBalance = add(balance, amount);
        assert(isSafeMultiplier(newBalance));
        return newBalance;
    }

    function _subBalance(uint balance, uint amount) internal returns (uint) {
        totalLockedAmount -= amount;
        return balance - amount;
    }

    function _removeInvestor(address investor, uint256 balance) internal {
        totalLockedAmount -= balance;
        totalInvestors -= 1;
        delete accounts[investor];
    }

    function _changeState(LockState newState) internal {
        if (newState != lockState) {
            LockStateTransition(lockState, newState);
            lockState = newState;
        }
    }

}
