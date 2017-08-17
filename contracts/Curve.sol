pragma solidity ^0.4.11;

import 'zeppelin-solidity/contracts/ownership/Ownable.sol';
import './NeumarkController.sol';

contract Curve is Ownable {

    // TODO: Fractional Euros and Fractional Neumarks

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

    function Curve(NeumarkController neumarkController)
        Ownable()
    {
        totalEuroUlps = 0;
        NEUMARK_CONTROLLER = neumarkController;
    }

    // issues to msg.sender, further neumarks distribution happens there
    function issue(uint256 euroUlps)
        //onlyOwner()
        public
        returns (uint256)
    {
        return issueTo(euroUlps, msg.sender);
    }

    function issueTo(uint256 euroUlps, address beneficiary)
        //onlyOwner()
        public // I do not see any case where this function is public
        returns (uint256)
    {
        require(totalEuroUlps + euroUlps >= totalEuroUlps);
        uint256 neumarkUlps = incremental(euroUlps);
        totalEuroUlps = totalEuroUlps + euroUlps;
        assert(NEUMARK_CONTROLLER.generateTokens(beneficiary, neumarkUlps));
        NeumarksIssued(beneficiary, euroUlps, neumarkUlps);
        return neumarkUlps;
    }

    function burnNeumarkFrom(uint256 neumarkUlps, address beneficiary)
        // @remco I do not see use case where we burn someone's neumark
        //onlyOwner()
        public
        returns (uint256)
    {
        uint256 euroUlps = rewindInverse(neumarkUlps);
        burn(euroUlps, neumarkUlps, beneficiary);
        return euroUlps;
    }

    function burnNeumark(uint256 neumarkUlps)
        // @remco I do not see use case where we burn someone's neumark
        //onlyOwner()
        public
        returns (uint256)
    {
        return burnNeumarkFrom(neumarkUlps, msg.sender);
    }

    function burn(uint256 euroUlps, uint256 neumarkUlps, address beneficiary)
        //onlyOwner()
        //@remco - this should be internal function, i do not see an use case for any client to call it
        public
        // TODO: checkInverse(euroUlps, neumarkUlps)
        // TODO: Client side code
        // TODO: Solve race condition?
    {
        totalEuroUlps -= euroUlps;
        assert(NEUMARK_CONTROLLER.destroyTokens(beneficiary, neumarkUlps));
        NeumarksBurned(beneficiary, euroUlps, neumarkUlps);
    }

    function cumulative(uint256 euroUlps)
        public
        constant
        returns (uint256)
    {
        return curve(euroUlps);
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

    function rewind(uint256 euroUlps)
        constant
        returns (uint256)
    {
        require(totalEuroUlps >= euroUlps);
        uint256 from = cumulative(totalEuroUlps - euroUlps);
        uint256 to = cumulative(totalEuroUlps);
        assert(to >= from); // Issuance curve needs to be monotonic
        return to - from;
    }

    function rewindInverse(uint256 neumarkUlps)
        constant
        returns (uint256)
    {
        if(neumarkUlps == 0) {
            return 0;
        }
        uint256 to = cumulative(totalEuroUlps);
        require(to >= neumarkUlps);
        uint256 fromNmk = to - neumarkUlps;
        uint256 fromEur = inverse(fromNmk, 0, totalEuroUlps);
        assert(totalEuroUlps >= fromEur);
        uint256 euros = totalEuroUlps - fromEur;
        // TODO: Inverse is not exact!
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
    function curve(uint256 euroUlps)
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

    function inverse(uint256 neumarkUlps, uint256 min, uint256 max)
        constant
        returns (uint256)
    {
        require(max >= min);
        require(curve(min) <= neumarkUlps);
        require(curve(max) >= neumarkUlps);

        // Binary search
        while (max > min) {
            uint256 mid = (max + min + 1) / 2;
            uint256 val = curve(mid);
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
        if(curve(max) == neumarkUlps) {
            return max;
        }

        // NOTE: It is possible that there is no inverse
        // for example curve(0) = 0 and curve(1) = 6, so
        // there is no value y such that curve(y) = 5.
        // In this case we return a value such that curve(y) < x
        // and curve(y + 1) > x.
        assert(curve(max) < neumarkUlps);
        assert(curve(max + 1) > neumarkUlps);
        return max;
    }
}
