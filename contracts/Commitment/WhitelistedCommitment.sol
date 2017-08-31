pragma solidity 0.4.15;

import './PublicCommitment.sol';


contract WhitelistedCommitment is AccessRoles, CommitmentBase {

    // mapping of addresses allowed to participate
    mapping (address => bool) public whitelisted;
    address[] public whitelistedInvestors;
    // mapping of addresses allowed to participate for fixed Neumark cost
    mapping (address => uint256) public fixedCostTickets;
    mapping (address => uint256) public fixedCostNeumarks;
    address[] public fixedCostInvestors;

    // order of investors matter! first will get better terms on neumarks
    function setOrderedWhitelist(address[] addresses, uint256[] tickets)
        public
        only(ROLE_WHITELIST_ADMIN)
    {
        // can be set only once
        require(fixedCostInvestors.length == 0);
        require(addresses.length == tickets.length);
        // before commitment starts
        require(currentTime() < startDate);
        // move to storage
        for(uint256 idx=0; idx < addresses.length; idx++) {
            uint256 ticket = tickets[idx];
            // tickets of size 0 will not be accepted
            require(ticket > 0);
            // allow to invest up to ticket on fixed cost
            fixedCostTickets[addresses[idx]] = ticket;

            // issue neumarks for given investor
            uint256 ticketEuroUlps = convertToEUR(ticket);
            fixedCostNeumarks[addresses[idx]] = neumark.issueForEuro(ticketEuroUlps);

            // also allow to invest from unordered whitelist along the curve
            whitelisted[addresses[idx]] = true;
        }

        // leave array for easy enumeration
        fixedCostInvestors = addresses;
    }

    function setWhitelist(address[] addresses)
        public
        only(ROLE_WHITELIST_ADMIN)
    {
        // can be set only once
        require(whitelistedInvestors.length == 0);
        // before commitment starts
        require(currentTime() < startDate);
        // move to storage
        for(uint256 idx=0; idx < addresses.length; idx++) {
            whitelisted[addresses[idx]] = true;
        }
        // leave array for easy enumeration
        whitelistedInvestors = addresses;
    }

    /// allows to abort commitment process before it starts and rollback curve
    // @remco this is a small breach of trust as we can invalidate terms any moment
    function abortCommitment()
        public
        only(ROLE_WHITELIST_ADMIN)
    {
        require(currentTime()<startDate);
        rollbackCurve();
        selfdestruct(address(0));
    }

    function rollbackCurve()
        internal
    {
        uint neumarks = neumark.balanceOf(address(this));
        if (neumarks > 0) {
            neumark.burnNeumark(neumarks);
        }
    }

    // implement BaseCommitment abstract functions
    // all overriden functions are called via public commit and finalize

    function onCommitmentSuccessful()
        internal
    {
        // rollback unspect neumarks from fixed pool
        rollbackCurve();
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
        // returns 0 in case of investor has no fixed cost ticket
        uint256 fixedInvestorTicket = fixedCostTickets[investor];
        // what is above limit for fixed price should be rewarded from curve
        uint256 whitelistReward = 0;
        uint256 remainingAmount = amount;
        if (amount > fixedInvestorTicket) {
            uint256 whitelistedAmount = amount - fixedInvestorTicket;
            uint256 whitelistedEuroUlps = convertToEUR(whitelistedAmount);
            whitelistReward = neumark.issueForEuro(whitelistedEuroUlps);
            remainingAmount = fixedInvestorTicket;
        }
        // get pro rata neumark reward for any eth left
        uint256 fixedReward = 0;
        if (remainingAmount > 0) {
            uint256 fixedInvestorNeumarks = fixedCostNeumarks[investor];
            fixedReward = proportion(fixedInvestorNeumarks, remainingAmount, fixedInvestorTicket);
            // if investor gets neumark with `k` tranches of different wei sizes a1...ak and `ticket` is total declared ticket
            // then last proportion must be: ak / (ticket - sum(a1...ak-1)) == 1
            // which gives fixedReward == fixedInvestorNeumarks, therefore we may safely do the following:
            fixedCostNeumarks[investor] -= fixedReward;
            fixedCostTickets[investor] -= remainingAmount;
        }
        // distribute to investor and platform operator
        return distributeAndReturnInvestorNeumarks(investor, whitelistReward + fixedReward);
    }

    function validCommitment()
        internal
        constant
        returns (bool)
    {
        // latter part of this condition is not needed because we whitelist every fixed cost investor
        // kept to make condition clear
        return (whitelisted[msg.sender] || fixedCostTickets[msg.sender] > 0);
    }

    function WhitelistedCommitment(
        IAccessPolicy _policy,
        EtherToken _ethToken,
        LockedAccount _lockedAccount,
        Neumark _neumark
    )
         CommitmentBase(_policy, _ethToken, _lockedAccount, _neumark)
         Reclaimable([neumark])
    {
    }
}
