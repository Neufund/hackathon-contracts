pragma solidity 0.4.15;

contract NeumarkIssuanceCurve {

    function incremental(uint256 totalEuroUlps, uint256 euroUlps)
        public
        constant
        returns (uint256 neumarkUlps)
    {
        require(totalEuroUlps + euroUlps >= totalEuroUlps);
        uint256 from = cumulative(totalEuroUlps);
        uint256 to = cumulative(totalEuroUlps + euroUlps);
        assert(to >= from); // Issuance curve needs to be monotonic
        return to - from;
    }

    /// @dev The result is rounded down.
    function incrementalInverse(uint256 totalEuroUlps, uint256 neumarkUlps)
        public
        constant
        returns (uint256 euroUlps)
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
        return euros;
    }

    function cumulative(uint256 euroUlps)
        public
        constant
        returns(uint256 neumarkUlps)
    {
        uint256 cap   = 1500000000000000000000000000;
        uint256 D     =  230769230769230769230769231;
        uint256 nLim  = 8300000000000000000000000000;

        // Return the cap if n is above the limit.
        if(euroUlps >= nLim) {
            return cap;
        }

        // Approximate cap-cap·(1-1/D)^n using the Binomial theorem
        uint256 term = cap;
        uint256 sum = 0;
        uint256 denom = D;
        do assembly {
            // We use assembler primarily to avoid the expensive
            // divide-by-zero check solc inserts for the / operator.
            term  := div(mul(term, euroUlps), denom)
            sum   := add(sum, term)
            denom := add(denom, D)
            term  := div(mul(term, euroUlps), denom)
            sum   := sub(sum, term)
            denom := add(denom, D)
        } while(term != 0);
        return sum;
    }

    /// @dev The result is rounded up.
    function cumulativeInverse(uint256 neumarkUlps, uint256 min, uint256 max)
        public
        constant
        returns (uint256 euroUlps)
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
        // for example curve(0) = 0 and curve(1) = 6, so
        // there is no value y such that curve(y) = 5.
        // In this case we return a value such that curve(y) < x
        // and curve(y + 1) > x.
        assert(cumulative(max) < neumarkUlps);
        assert(cumulative(max + 1) > neumarkUlps);

        // When there is no inverse, we round up.
        // This has the effect of reversing the curve less when
        // burning Neumarks. This ensures that Neumarks can always
        // be burned. It also ensure that the total supply of Neumarks
        // remains below the cap.
        return max + 1;
    }
}
