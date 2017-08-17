pragma solidity ^0.4.11;

import './AccessControl/AccessControlled.sol';
import './Roles.sol';
import './NeumarkController.sol';

contract Curve is AccessControlled, Roles {

    NeumarkController public NEUMARK_CONTROLLER;

    uint256 public totalEuroUlps;

    event NeumarksIssued(address beneficiary, uint256 euros, uint256 neumarks);
    event NeumarksBurned(address beneficiary, uint256 euros, uint256 neumarks);

    modifier checkInverse(uint256 euroUlps, uint256 neumarkUlps)
    {
        // TODO: Error margin?
        require(rewind(euroUlps) == neumarkUlps);
        _;
    }

    function Curve(
        IAccessPolicy accessPolicy,
        NeumarkController neumarkController
    )
        AccessControlled(accessPolicy)
    {
        NEUMARK_CONTROLLER = neumarkController;
        totalEuroUlps = 0;
    }

    // issues to msg.sender, further neumarks distribution happens there
    function issue(uint256 euroUlps)
        only(ROLE_NEUMARK_ISSUER)
        public
        returns (uint256)
    {
        require(totalEuroUlps + euroUlps >= totalEuroUlps);
        uint256 neumarkUlps = incremental(euroUlps);
        totalEuroUlps = totalEuroUlps + euroUlps;
        assert(NEUMARK_CONTROLLER.generateTokens(msg.sender, neumarkUlps));
        NeumarksIssued(msg.sender, euroUlps, neumarkUlps);
        return neumarkUlps;
    }

    function burn(uint256 neumarkUlps)
        public
        returns (uint256)
    {
        uint256 euroUlps = decrementalInverse(neumarkUlps);

        totalEuroUlps -= euroUlps;
        assert(NEUMARK_CONTROLLER.destroyTokens(beneficiary, neumarkUlps));

        NeumarksBurned(beneficiary, euroUlps, neumarkUlps);
        return euroUlps;
    }

    function incremental(uint256 euroUlps)
        public
        constant
        returns (uint256)
    {
        require(totalEuroUlps + euroUlps >= totalEuroUlps);
        uint256 from = cumulative(totalEuroUlps);
        uint256 to = cumulative(totalEuroUlps + euroUlps);
        assert(to >= from); // Issuance curve needs to be monotonic
        return to - from;
    }

    function decremental(uint256 euroUlps)
        public
        constant
        returns (uint256)
    {
        require(totalEuroUlps >= euroUlps);
        uint256 from = cumulative(totalEuroUlps - euroUlps);
        uint256 to = cumulative(totalEuroUlps);
        assert(to >= from); // Issuance curve needs to be monotonic
        return to - from;
    }

    function decrementalInverse(uint256 neumarkUlps)
        public
        constant
        returns (uint256)
    {
        if(neumarkUlps == 0) {
            return 0;
        }
        uint256 to = cumulative(totalEuroUlps);
        require(to >= neumarkUlps);
        uint256 fromNmk = to - neumarkUlps;
        uint256 fromEur = cumulativeInverse(fromNmk, 0, totalEuroUlps);
        assert(totalEuroUlps >= fromEur);
        uint256 euros = totalEuroUlps - fromEur;
        // TODO: Inverse is not necesarily exact!
        // assert(rewind(euros) == neumarkUlps);
        return euros;
    }

    // Gas consumption (for x in EUR):
    // 0    324
    // 1    530
    // 10   530
    // 100  606
    // 10³  606
    // 10⁶  953
    // 10⁹  3426
    // CAP  4055
    // LIM  10686
    // ≥    258
    function cumulative(uint256 euroUlps)
        public
        constant
        returns(uint256)
    {
        // TODO: Explain.
        // TODO: Proof error bounds / correctness.
        // TODO: Proof or check for overflow.

        uint256 NMK_DECIMALS = 10**18;
        uint256 EUR_DECIMALS = 10**18;
        uint256 CAP = 1500000000;

        // At some point the curve is flat to within a small
        // fraction of a Neumark. We just make it flat.
        uint256 LIM = 83 * 10**8 * EUR_DECIMALS;
        if(euroUlps >= LIM) {
            return CAP * NMK_DECIMALS;
        }

        // 1 - 1/D ≈ e^(-6.5 / CAP·EUR_DECIMALS)
        // D = Round[1 / (1 - e^(-6.5 / CAP·EUR_DECIMALS))]
        uint256 D = 230769230769230769230769231;

        // Cap in NMK-ULP (Neumark units of least precision).
        uint256 C = CAP * NMK_DECIMALS;

        // Compute C - C·(1 - 1/D)^x using binomial expansion.
        // Assuming D ≫ x ≫ 1 so we don't bother with
        // the `x -= 1` because we will converge before this
        // has a noticable impact on `x`.
        uint256 n = C;
        uint256 a = 0;
        uint256 d = D;
        assembly {
            repeat:
                n := div(mul(n, euroUlps), d)
                jumpi(done, iszero(n))
                a := add(a, n)
                d := add(d, D)
                n := div(mul(n, euroUlps), d)
                jumpi(done, iszero(n))
                a := sub(a, n)
                d := add(d, D)
                jump(repeat)
            done:
        }
        return a;
    }

    function cumulativeInverse(uint256 neumarkUlps, uint256 min, uint256 max)
        public
        constant
        returns (uint256)
    {
        require(max >= min);
        require(cumulative(min) <= neumarkUlps);
        require(cumulative(max) >= neumarkUlps);

        // Binary search
        while (max > min) {
            uint256 mid = (max + min + 1) / 2;
            uint256 val = cumulative(mid);
            if(val == neumarkUlps) {
                return mid;
            }
            if(val < neumarkUlps) {
                min = mid;
            } else {
                max = mid - 1;
            }
        }
        assert(max == min);

        // Did we find an exact solution?
        if(cumulative(max) == neumarkUlps) {
            return max;
        }

        // NOTE: It is possible that there is no inverse
        // for example cumulative(0) = 0 and cumulative(1) = 6, so
        // there is no value y such that cumulative(y) = 5.
        // In this case we return a value such that cumulative(y) < x
        // and cumulative(y + 1) > x.
        assert(cumulative(max) < neumarkUlps);
        assert(cumulative(max + 1) > neumarkUlps);
        return max;
    }
}
