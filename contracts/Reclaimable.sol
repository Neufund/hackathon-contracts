pragma solidity 0.4.15;

import './Standards/IBasicToken.sol';
import './AccessControl/AccessControlled.sol';
import './AccessRoles.sol';

contract Reclaimable is AccessControlled, AccessRoles {

    IBasicToken constant public RECLAIM_ETHER = IBasicToken(0x0);

    function reclaim(IBasicToken token)
        public
        only(ROLE_RECLAIMER)
        returns (bool)
    {
        uint256 balance = token == RECLAIM_ETHER ?
            this.balance : token.balanceOf(this);
        return reclaimAmount(token, balance);
    }

    function reclaimAmount(IBasicToken token, uint256 amount)
        public
        only(ROLE_RECLAIMER)
        returns (bool)
    {
        address receiver = msg.sender;
        bool success = token == RECLAIM_ETHER ?
            receiver.send(amount) : token.transfer(receiver, amount);
        return success;
    }
}
