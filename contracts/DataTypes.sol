// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library DataTypes {
    enum Status {
        OPEN,
        ABORTED,
        FULFILLED,
        CLOSED,
        DISPUTED,
        NULL
    }

    enum AnswerType {
        BINARY,
        UINT,
        STRING
    }

    struct CreateRequestData {
        AnswerType answerType;
        string body;
        string coordinates;
        IERC20 rewardAsset;
        uint256 rewardAmount;
        uint256 deadline;
        uint256 minVotes;
    }

    struct Request {
        address requester;
        // description of video requirements + query looking for answer
        string body;
        // lat:<Number>,lon:<Number>
        string coordinates;
        // reward
        IERC20 rewardAsset; // IERC20(address(0)) corresponds to the NATIVE coin (MATIC on Polygon)
        uint256 rewardAmount;
        // unix timestamp of deadline
        uint256 deadline;
        // minimum votes for a proof to be elected
        uint256 minVotes;
        // request status
        Status status;
        // winning proof
        uint256 electedProof;
        // answers conf
        AnswerType answerType;
    }

    struct Proof {
        address verifier;
        uint256 tokenId;
        // 0 or 1 for BINARY, any uint256 for UINT, the id of the answer for STRING
        uint256 answer;
    }

    struct Dispute {
        string reason;
        bool open;
        uint256 deadline; // ~7 days after opening dispute
        // agree with the rejection
        uint256 aye;
        // disagree with the rejection
        uint256 nay;
    }
}
