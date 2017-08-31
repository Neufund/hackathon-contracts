pragma solidity 0.4.15;

import "./CommitmentBase.sol";
import "../AccessControl/RoleBasedAccessControl.sol";

/// public capital commitment for general public
contract PublicCommitment is CommitmentBase {

    // implement BaseCommitment abstract functions
    // all overriden functions are called via public commit and finalize

    function onCommitmentSuccessful()
        internal
    {
        // enable Neumark trading in token controller
        neumark.enableTransfer(true);
        RoleBasedAccessControl(neumark.accessPolicy()).setUserRole(
            RoleBasedAccessControl.EVERYONE,
            ROLE_NEUMARK_TRADER,
            neumark,
            RoleBasedAccessControl.TriState.Allow
        );

        // enable escape hatch and end locking funds phase
        lockedAccount.controllerSucceeded();
    }

    function onCommitmentFailed()
        internal
    {
        // unlock all accounts in lockedAccount
        lockedAccount.controllerFailed();
    }

    function giveNeumarks(address investor, uint256 amount)
        internal
        returns (uint256)
    {
        uint256 euroUlps = convertToEUR(amount);
        // issue to self
        uint256 neumarkUlps = neumark.issueForEuro(euroUlps);
        return distributeAndReturnInvestorNeumarks(investor, neumarkUlps);
    }

    function validCommitment()
        internal
        constant
        returns (bool)
    {
        return true;
    }

    function PublicCommitment(
        IAccessPolicy _policy,
        EtherToken _ethToken,
        LockedAccount _lockedAccount,
        Neumark _neumark
    )
         CommitmentBase(_policy, _ethToken, _lockedAccount, _neumark)
    {
    }
}
