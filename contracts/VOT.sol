// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract VOT is Ownable, ERC20("VideOracle Token", "VOT") {
    uint256 public constant MAX_SUPPLY = 1e18 * 1e9;

    constructor() {
        _mint(_msgSender(), MAX_SUPPLY);
    }
}
