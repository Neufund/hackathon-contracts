pragma solidity 0.4.15;

import './AccessControl/AccessControlled.sol';
import './AccessRoles.sol';
import './Reclaimable.sol';


contract EthereumForkArbiter is AccessControlled, AccessRoles, Reclaimable {

    string public nextForkName;
    string public nextForkUrl;
    uint256 public lastSignedBlockNumber;
    bytes32 public lastSignedBlockHash;
    uint256 public lastSignedTimestamp;

    event ForkAnnounced(
        string name,
        string url
    );

    event ForkSigned(
        uint256 blockNumber,
        bytes32 blockHash
    );

    function EthereumForkArbiter(IAccessPolicy accessPolicy)
        AccessControlled(accessPolicy)
        Reclaimable([])
    {
    }

    /// @notice Announce that a particular future Ethereum fork will the one taken by the contract. The contract on the other branch should be considered invalid. Once the fork has happened, it will additionally be confirmed by signing a block on the fork. Notice that forks may happen unannounced.
    function announceFork(string name, string url)
        public
        only(ROLE_FORK_ARBITER)
    {
        nextForkName = name;
        nextForkUrl = url;
        ForkAnnounced(nextForkName, nextForkUrl);
    }

    /// @notice Declare that the current fork (as identified by a blockhash) is the valid fork. The valid fork is always the one with the most recent signature.
    function signFork(uint256 number, bytes32 hash)
        public
        only(ROLE_FORK_ARBITER)
    {
        require(block.blockhash(number) == hash);
        lastSignedBlockNumber = number;
        lastSignedBlockHash = hash;
        lastSignedTimestamp = block.timestamp;
        ForkSigned(lastSignedBlockNumber, lastSignedBlockHash);
    }
}
