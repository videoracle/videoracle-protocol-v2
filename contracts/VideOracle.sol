// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {DataTypes} from "./DataTypes.sol";

import "hardhat/console.sol";

/**
 * @title VideOracle
 * A protocol for video verification of IRL events
 * The system acts like an optimistic oracle.
 * Requests are to be fulfilled within the specified deadline but a dipute window of 3 days after such date is given.
 * If a dispute is created, the time frame for its resolution is of 3 days.
 * This puts the maximum timeframe before receiving a final answer of 6 days after the request's deadline.
 */
contract VideOracle is Ownable, ReentrancyGuard {
    using Address for address;
    using Counters for Counters.Counter;
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    event NewRequest(address indexed src, uint256 requestId);
    event NewProof(address indexed src, uint256 requestId, uint256 proofId);
    event NewProofVote(address indexed src, uint256 requestId, uint256 proofId);
    event RequestAnswered(uint256 requestId);
    event RequestAborted(uint256 requestId);
    event VerificationAccepted(uint256 requestId);
    event VerificationRejected(uint256 requestId, string reason);
    event NewDisputeVote(address indexed src, uint256 requestId, bool aye);
    event Claim(uint256 reqId, uint256 amount);

    // GENERAL CONF
    address public feeCollector;
    uint256 public fee;
    // which ERC20 can be used as reward
    EnumerableSet.AddressSet internal _acceptedRewards;

    // Requests
    Counters.Counter internal _requestIdCounter;
    mapping(uint256 => DataTypes.Request) public requests;
    // only for AnswerType.STRING {0: "Alice", 1: "Bob", 2: "Carol", ...}
    mapping(uint256 => mapping(uint256 => string))
        public acceptedAnswersByRequest;
    // Proofs
    mapping(uint256 => DataTypes.Proof[]) public proofsByRequest;
    mapping(uint256 => address) public proofVerifier;
    mapping(uint256 => mapping(address => bool)) public hasGivenProofToRequest;
    // Votes
    mapping(uint256 => mapping(uint256 => address[]))
        public votersByProofByRequest;
    mapping(uint256 => mapping(uint256 => mapping(address => bool)))
        public hasVotedForProofToRequest;
    mapping(uint256 => mapping(address => bool)) public hasVotedOnRequest;
    mapping(uint256 => address[]) public votersByRequest;
    mapping(uint256 => mapping(address => uint256)) public stakedByRequest;
    // Disputes
    mapping(uint256 => DataTypes.Dispute) public disputes;
    mapping(uint256 => mapping(address => bool)) public hasVotedOnDispute;
    mapping(uint256 => address[]) public disputeVoters;

    modifier onlyOpenRequest(uint256 reqId) {
        DataTypes.Request storage req = requests[reqId];
        require(
            block.timestamp <= req.deadline &&
                req.status == DataTypes.Status.OPEN,
            "Request not OPEN"
        );
        _;
    }

    constructor(
        address feeCollector_,
        uint256 fee_,
        address[] memory accepted
    ) {
        feeCollector = feeCollector_;
        fee = fee_;
        for (uint256 i; i < accepted.length; ++i) {
            _acceptedRewards.add(accepted[i]);
        }
    }

    /////////////////////
    // EXTERNAL FUNCTIONS
    /////////////////////

    function acceptedRewards() external view returns (address[] memory) {
        return _acceptedRewards.values();
    }

    /**
     * @notice get the number of submitted requests
     * @return uint
     */
    function totalRequests() external view returns (uint256) {
        return _requestIdCounter.current();
    }

    /**
     * @notice create a request.
     * @dev requires prior approval of spending byt this if reward asset is ERC20
     * @param requestData - data necessary to create the request
     * @param answers - list of possible answers, only used when answerType == STRING.
     */
    function createRequest(
        DataTypes.CreateRequestData memory requestData,
        string[] calldata answers
    ) external payable {
        require(
            _acceptedRewards.contains(address(requestData.rewardAsset)),
            "Unsupported reward"
        );
        if (address(requestData.rewardAsset) == address(0)) {
            require(
                msg.value == requestData.rewardAmount + fee,
                "Invalid amount received"
            );
        } else {
            require(msg.value == fee, "Not enough to pay fee");
            requestData.rewardAsset.safeTransferFrom(
                _msgSender(),
                address(this),
                requestData.rewardAmount
            );
        }
        Address.sendValue(payable(feeCollector), fee);

        uint256 requestId = _requestIdCounter.current();
        requests[requestId] = DataTypes.Request({
            requester: _msgSender(),
            status: DataTypes.Status.OPEN,
            electedProof: type(uint256).max,
            answerType: requestData.answerType,
            body: requestData.body,
            coordinates: requestData.coordinates,
            rewardAsset: requestData.rewardAsset,
            rewardAmount: requestData.rewardAmount,
            deadline: requestData.deadline,
            minVotes: requestData.minVotes
        });
        if (requestData.answerType == DataTypes.AnswerType.STRING) {
            require(answers.length > 1, "Not enough answers provided");
            for (uint256 i; i < answers.length; ++i) {
                acceptedAnswersByRequest[requestId][i] = answers[i];
            }
        }
        _requestIdCounter.increment();
        emit NewRequest(_msgSender(), requestId);
    }

    /**
     * @notice Submit videoNFT with id `tokenId` as proof to the request `reqId`
     * @dev a VideoNFT must have been minted through LivePeer's VideoNFT contract
     * @param reqId - the id of the request
     * @param tokenId - the tokenId from the VideoNFT contract
     * @param answer - uint256 representing the answer to the request
     */
    function submitProof(
        uint256 reqId,
        uint256 tokenId,
        uint256 answer
    ) external {
        uint256 deadline = requests[reqId].deadline;
        require(block.timestamp < deadline, "Request expired");
        address verifier = _msgSender();
        require(
            !hasGivenProofToRequest[reqId][verifier],
            "Cannot submit multiple proofs"
        );
        DataTypes.AnswerType answerType = requests[reqId].answerType;
        if (answerType == DataTypes.AnswerType.BINARY) {
            require(answer == 0 || answer == 1, "Answer not valid");
        } else if (answerType == DataTypes.AnswerType.STRING) {
            // Although not 100% fool proof the possibility of having 2^256-1 accepted answers is negligible
            require(
                keccak256(
                    abi.encode(acceptedAnswersByRequest[reqId][answer])
                ) !=
                    keccak256(
                        abi.encode(
                            acceptedAnswersByRequest[reqId][type(uint256).max]
                        )
                    ),
                "Answer not valid"
            );
        }
        DataTypes.Proof[] storage requestProofs = proofsByRequest[reqId];
        proofVerifier[tokenId] = verifier;
        uint256 proofIndex = requestProofs.length;
        hasGivenProofToRequest[reqId][verifier] = true;
        requestProofs.push(
            DataTypes.Proof({
                verifier: verifier,
                tokenId: tokenId,
                answer: answer
            })
        );
        emit NewProof(verifier, reqId, proofIndex);
    }

    /**
     * @notice Upvote proof `proofId` of request `reqId`
     * @dev requires prevous approval for spending of rewardAsset
     * @param reqId - the id of the request
     * @param proofId - the id of the proof
     */
    function upvoteProof(uint256 reqId, uint256 proofId) external payable {
        DataTypes.Request memory req = requests[reqId];
        require(block.timestamp <= req.deadline, "Request expired");
        uint256 stakeAmount = _stakeAmountForRequest(reqId, req, proofId);
        _transferIn(req.rewardAsset, _msgSender(), stakeAmount);
        stakedByRequest[reqId][_msgSender()] = stakeAmount;
        require(!hasVotedOnRequest[reqId][_msgSender()], "Vote already cast");
        uint256 proofTokenId = proofsByRequest[reqId][proofId].tokenId;
        require(
            proofVerifier[proofTokenId] != _msgSender(),
            "Cannot upvote own proof"
        );
        votersByRequest[reqId].push(_msgSender());
        votersByProofByRequest[reqId][proofId].push(_msgSender());
        hasVotedOnRequest[reqId][_msgSender()] = true;
        hasVotedForProofToRequest[reqId][proofId][_msgSender()] = true;

        uint256 votersForProof = votersByProofByRequest[reqId][proofId].length;
        if (votersForProof >= req.minVotes) {
            requests[reqId].status = DataTypes.Status.FULFILLED;
            if (req.electedProof == type(uint256).max) {
                requests[reqId].electedProof = proofId;
            } else {
                if (
                    votersForProof >
                    votersByProofByRequest[reqId][req.electedProof].length
                ) {
                    requests[reqId].electedProof = proofId;
                }
            }
        }
        emit NewProofVote(_msgSender(), reqId, proofId);
    }

    /**
     * @notice Reject the verification from the protocol and raise a dispute for request `reqId`
     * @param reqId - the id of the request
     * @param reason - an explanation as to why the verification is rejected
     */
    function createDispute(uint256 reqId, string calldata reason)
        external
        payable
    {
        DataTypes.Request memory req = requests[reqId];
        require(block.timestamp >= req.deadline, "Request not expired");
        require(
            block.timestamp <= req.deadline + 3 days,
            "No longer disputable"
        );
        require(
            req.requester == _msgSender(),
            "Only requester can create dispute"
        );
        require(
            votersByRequest[reqId].length >
                votersByProofByRequest[reqId][req.electedProof].length,
            "Dispute cannot be created as all voters voted for the elected proof"
        );
        // stake
        _transferIn(req.rewardAsset, _msgSender(), req.rewardAmount / 10);
        requests[reqId].status = DataTypes.Status.DISPUTED;
        DataTypes.Dispute memory dispute = DataTypes.Dispute({
            reason: reason,
            open: true,
            deadline: block.timestamp + 3 days,
            aye: 0,
            nay: 0
        });
        disputes[reqId] = dispute;
        emit VerificationRejected(reqId, reason);
    }

    /**
     * @notice Abort the request `reqId` and return any funds to their respective owners.
     * No proofs must have been submitted yet
     * @param reqId - the id of the request
     */
    function abortRequest(uint256 reqId) external nonReentrant {
        DataTypes.Request storage req = requests[reqId];
        require(_msgSender() == req.requester, "Not requester");
        require(proofsByRequest[reqId].length == 0, "Cannot abort now");
        req.status = DataTypes.Status.ABORTED;
        _transferOut(req.rewardAsset, _msgSender(), req.rewardAmount);
        emit RequestAborted(reqId);
    }

    /**
     * @notice Cast vote on dispute for `reqId`. It is `aye` that you agree the dispute is legit.
     * @param reqId - the id of the request the dispute belongs to
     * @param aye - wether you consider the dispute legit or not
     */
    function voteOnDispute(uint256 reqId, bool aye) external {
        DataTypes.Dispute memory dispute = disputes[reqId];
        if (dispute.open && block.timestamp >= dispute.deadline) {
            _closeDispute(reqId, dispute);
            return;
        }
        require(dispute.open, "Dispute closed");
        require(!hasVotedOnDispute[reqId][_msgSender()], "Cannot vote twice");
        uint256 proofId = requests[reqId].electedProof;
        require(
            (requests[reqId].requester != _msgSender()) &&
                (hasVotedOnRequest[reqId][_msgSender()]) &&
                (proofsByRequest[reqId][proofId].verifier != _msgSender()) &&
                (!hasVotedForProofToRequest[reqId][proofId][_msgSender()]),
            "Cannot participate in dispute"
        );
        aye ? dispute.aye++ : dispute.nay++;
        hasVotedOnDispute[reqId][_msgSender()] = true;
        disputeVoters[reqId].push(_msgSender());
        emit NewDisputeVote(_msgSender(), reqId, aye);
        disputes[reqId] = dispute;
    }

    /**
     * @notice Claim funds from requests as request voter
     * if voted the electedProof
     *    if no dispute or dispute won - stake + reward portion
     *    else if dispute lost - possible excess of stake
     *    else (dispute null) - stake
     * if voted for other proof
     *    if no dispute or not voted on dispute - stake
     *    else (voted on dispute) - stake + dispute reward
     */
    function claimFundsAsVoter(uint256[] calldata requestIds)
        external
        nonReentrant
    {
        uint256 loops = requestIds.length;
        for (uint256 i; i < loops; ++i) {
            uint256 reqId = requestIds[i];
            if (!hasVotedOnRequest[reqId][_msgSender()]) {
                // skip if sender has not voted on the request
                continue;
            }
            DataTypes.Request memory req = requests[reqId];
            DataTypes.Dispute memory dispute = disputes[reqId];
            bool disputeExists = req.status == DataTypes.Status.DISPUTED;
            bool supportedElectedProof = hasVotedForProofToRequest[reqId][
                req.electedProof
            ][_msgSender()];
            uint256 staked = stakedByRequest[reqId][_msgSender()];
            uint256 amountToTransfer;
            if (supportedElectedProof) {
                if (!disputeExists || dispute.nay > dispute.aye) {
                    uint256 voters = votersByProofByRequest[reqId][
                        req.electedProof
                    ].length;
                    uint256 rewardPart = req.rewardAmount / (2 * voters);
                    amountToTransfer = staked + rewardPart;
                } else if (dispute.nay < dispute.aye) {
                    uint256 voters = votersByProofByRequest[reqId][
                        req.electedProof
                    ].length;
                    amountToTransfer = staked - req.rewardAmount / (2 * voters);
                } else {
                    amountToTransfer = staked;
                }
            } else {
                if (!disputeExists || !hasVotedOnDispute[reqId][_msgSender()]) {
                    amountToTransfer = staked;
                } else {
                    amountToTransfer =
                        staked +
                        req.rewardAmount /
                        (10 * disputeVoters[reqId].length);
                }
            }
            _transferOut(req.rewardAsset, _msgSender(), amountToTransfer);
            emit Claim(reqId, amountToTransfer);
        }
    }

    /**
     * @notice Claim funds as Verifier
     * Verifier only has to claim if request was accepted and the elected proof was submitted by them
     */
    function claimFundsAsVerifier(uint256[] calldata requestIds)
        external
        nonReentrant
    {
        uint256 loops = requestIds.length;
        for (uint256 i; i < loops; ++i) {
            uint256 reqId = requestIds[i];
            if (!hasGivenProofToRequest[reqId][_msgSender()]) {
                // skip if not verifier
                continue;
            }
            DataTypes.Request memory req = requests[reqId];
            if (block.timestamp < req.deadline + 3 days) {
                // too early to claim - can still be disputed
                continue;
            }
            uint256 tokenId = proofsByRequest[reqId][req.electedProof].tokenId;
            if (proofVerifier[tokenId] == _msgSender()) {
                if (req.status != DataTypes.Status.DISPUTED) {
                    _transferOut(
                        req.rewardAsset,
                        _msgSender(),
                        req.rewardAmount / 2
                    );
                    emit Claim(reqId, req.rewardAmount / 2);
                }
            }
        }
    }

    /**
     * @notice Claim funds as requester for list of requests
     * Requester only has somethign to claim if the request has been disputed and the dispute was won
     */
    function claimFundsAsRequester(uint256[] calldata requestIds)
        external
        nonReentrant
    {
        uint256 loops = requestIds.length;
        for (uint256 i; i < loops; ++i) {
            uint256 reqId = requestIds[i];
            DataTypes.Request memory req = requests[reqId];
            if (req.requester != _msgSender()) {
                // skip if not requester
                continue;
            }
            uint256 expiry = req.deadline + 3 days;
            if (req.status == DataTypes.Status.DISPUTED) {
                expiry = disputes[reqId].deadline;
            }
            if (block.timestamp < expiry) {
                // too early to claim
                continue;
            }
            DataTypes.Dispute memory dispute = disputes[reqId];
            if (dispute.aye > dispute.nay) {
                _transferOut(
                    req.rewardAsset,
                    _msgSender(),
                    (req.rewardAmount * 11) / 10
                );
                emit Claim(reqId, (req.rewardAmount * 11) / 10);
            }
        }
    }

    /////////////////////
    // INTERNAL FUNCTIONS
    /////////////////////

    /**
     * @notice returns the amount to stake in order to vote for the proof with id `proofId` for the request `requestId`
     * @param req - the request to calculate the amount for
     */
    function _stakeAmountForRequest(
        uint256 requestId,
        DataTypes.Request memory req,
        uint256 proofId
    ) internal view returns (uint256) {
        uint256 currentVotesForProof = votersByProofByRequest[requestId][
            proofId
        ].length;

        uint256 denominator = currentVotesForProof < req.minVotes
            ? req.minVotes
            : currentVotesForProof + 1;
        return req.rewardAmount / (10 * denominator); // 10% / votes
    }

    function _closeDispute(uint256 reqId, DataTypes.Dispute memory dispute)
        internal
    {
        dispute.open = false;
        disputes[reqId] = dispute;
    }

    function _transferIn(
        IERC20 asset,
        address from,
        uint256 amount
    ) internal {
        if (address(asset) == address(0)) {
            require(msg.value == amount, "Not enough staked");
        } else {
            asset.safeTransferFrom(from, address(this), amount);
        }
    }

    function _transferOut(
        IERC20 asset,
        address to,
        uint256 amount
    ) internal {
        if (address(asset) == address(0)) {
            Address.sendValue(payable(to), amount);
        } else {
            asset.safeTransferFrom(address(this), to, amount);
        }
    }

    /////////////////////
    // ADMIN FUNCTIONS
    /////////////////////

    function setFeeCollector(address feeCollector_) external onlyOwner {
        feeCollector = feeCollector_;
    }

    function setFee(uint256 fee_) external onlyOwner {
        fee = fee_;
    }

    function toggleAcceptedAsset(address asset) external onlyOwner {
        if (_acceptedRewards.contains(asset)) {
            _acceptedRewards.remove(asset);
        } else {
            _acceptedRewards.add(asset);
        }
    }
}
