// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {DataTypes} from "../DataTypes.sol";

interface IVideOracle {
    function feeCollector() external view returns (address);

    function fee() external view returns (uint256);

    function acceptedRewards() external view returns (address[] memory);

    function requests(uint256 id)
        external
        view
        returns (DataTypes.Request memory);

    function acceptedAnswersByRequest(uint256 reqId, uint256 answerId)
        external
        view
        returns (string memory);

    function proofsByRequest(uint256 reqId)
        external
        view
        returns (DataTypes.Proof[] memory);

    function proofVerifier(uint256 tokenId) external view returns (address);

    function hasGivenProofToRequest(address account, uint256 reqId)
        external
        view
        returns (bool);

    function votersByProofByRequest(uint256 reqId, uint256 proofId)
        external
        view
        returns (address[] memory);

    function hasVotedForProofToRequest(
        uint256 reqId,
        uint256 proofId,
        address account
    ) external view returns (bool);

    function hasCastedVoteForRequest(uint256 reqId, address account)
        external
        view
        returns (bool);

    function votersByRequest(uint256 reqId)
        external
        view
        returns (address[] memory);

    function disputes(uint256 reqId)
        external
        view
        returns (DataTypes.Dispute memory);

    function hasVotedOnDispute(uint256 reqId, address account)
        external
        view
        returns (bool);

    function disputeVoters(uint256 reqId)
        external
        view
        returns (address[] memory);

    /**
     * @notice get the number of submitted requests
     * @return uint
     */
    function totalRequests() external view returns (uint256);

    /**
     * @notice create a request.
     * In order to accommodate a potential dispute 110% of the reward is required.
     * The extra will be returned in case of no dispute or winning the dispute.
     * @param requestData - data necessary to fulfill the request
     * @param answers - list of possible answers, only used when answerType == STRING.
     */
    function createRequest(
        DataTypes.CreateRequestData memory requestData,
        string[] calldata answers
    ) external payable;

    /**
     * @notice Submit videoNFT with id `tokenId_` as proof to the request `requestId_`
     * @dev a VideoNFT must have been minted through LivePeer's VideoNFT contract
     * @param requestId_ - the id of the request
     * @param tokenId_ - the tokenId from the VideoNFT contract
     * @param answer_ - uint256 representing the answer to the request
     */
    function submitProof(
        uint256 requestId_,
        uint256 tokenId_,
        uint256 answer_
    ) external;

    /**
     * @notice Upvote proof `proofId_` of request `requestId_`
     * @dev requires prevous approval for spending of rewardAsset
     * @param requestId_ - the id of the request
     * @param proofId_ - the id of the proof
     */
    function upvoteProof(uint256 requestId_, uint256 proofId_) external payable;

    /**
     * @notice Reject the verification from the protocol and raise a dispute for request `requestId_`
     * @param requestId_ - the id of the request
     * @param reason_ - an explanation as to why the verification is rejected
     */
    function createDispute(uint256 requestId_, string calldata reason_)
        external
        payable;

    /**
     * @notice Abort the request `requestId_` and return any funds to their respective owners.
     * No proofs must have been submitted yet
     * @param requestId_ - the id of the request
     */
    function abortRequest(uint256 requestId_) external;

    /**
     * @notice Cast vote on dispute for `requestId_`. It is `aye_` that you agree the dispute is legit.
     * @param requestId_ - the id of the request the dispute belongs to
     * @param aye_ - wether you consider the dispute legit or not
     */
    function voteOnDispute(uint256 requestId_, bool aye_) external;

    /**
     * @notice Claim funds as requester for list of requests
     */
    function claimFundsAsRequester(uint256[] calldata requestIds) external;

    /**
     * @notice Claim funds as Verifier
     */
    function claimFundsAsVerifier(uint256[] calldata requestIds) external;

    /**
     * @notice Claim funds from requests as request voter
     */
    function claimFundsAsVoter(uint256[] calldata requestIds) external;
}
