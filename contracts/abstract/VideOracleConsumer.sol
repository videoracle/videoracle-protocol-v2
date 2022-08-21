// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DataTypes} from "../DataTypes.sol";
import {IVideOracleConsumer} from "../interfaces/IVideOracleConsumer.sol";

/**
 * Abstract contract providing basic hooks for VideOracle Request events
 */
abstract contract VideOracleConsumer is IVideOracleConsumer {
    function isConsumer() external pure returns (bool) {
        return true;
    }
}
