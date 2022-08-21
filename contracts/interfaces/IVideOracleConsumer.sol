// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DataTypes} from "../DataTypes.sol";

interface IVideOracleConsumer {
    function isConsumer() external returns (bool);

    function onRequestPendingValidation(
        uint256 requestId,
        DataTypes.Request calldata request
    ) external;

    function onDisputeOpened(
        uint256 requestId,
        DataTypes.Request calldata request,
        DataTypes.Dispute calldata dispute
    ) external;

    function onDisputeCLosed(
        uint256 requestId,
        DataTypes.Request calldata request,
        DataTypes.Dispute calldata dispute
    ) external;
}
