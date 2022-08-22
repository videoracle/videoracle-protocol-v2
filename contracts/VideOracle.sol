// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {IVideOracleConsumer} from "./interfaces/IVideOracleConsumer.sol";
import {DataTypes} from "./DataTypes.sol";

/**
 * VideOracle
 * A protocol for video verification of IRL events
 * The system acts like an optimistic oracle:
 * Requests are to be fulfilled within the specified deadline but a dipute window of 7 days after such date is given.
 * If a dispute is created, the time frame for its resolution is of 7 days.
 * This puts the maximum timeframe before receiving a final answer of 14 days + the request's time to answer (creation until deadline).
 *
 * In order to make a Request, the requester must have enough VOT to burn according to the requestCharge.
 * Upon creating a Request the requester set the reward for fulfilling said rquest by selecting a ERC20 and the amount to distribute.
 * in order to submit a Proof, the verifier must mint a videoNFT.
 * In order to vote for a Proof, the voter must stake an amount equal to 10% of the reward divided by the minNumberOfVotes of the request.
 * In order to create a Dispute, the disputer must stake an amount equal to 10% of the request's reward.
 * Dispute voters are rewarded only if they actually resolve the dispute by receiving either the voters or disputer staked amounts.
 * If the dispute resolves in favor of the disputer, they receive 20% of the request reward as compensation for preventing the requester from receiving a wrong answer. The requester is refunded the remaining 80%.
 * If the dispute resolves in favor of the request voters, the elected verifier and the voter who elected their proof receive the request's reward.
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

    // GENERAL CONF
    // address of VideOracle Token
    IERC20 public immutable VOT;
    // fee to create a request
    uint256 public requestCharge;
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
    mapping(address => mapping(uint256 => bool)) public hasGivenProofToRequest;
    // Votes
    mapping(uint256 => mapping(uint256 => address[]))
        public votersByProofByRequest;
    mapping(uint256 => mapping(uint256 => mapping(address => bool)))
        public hasVotedForProofToRequest;
    mapping(uint256 => mapping(address => bool)) public hasCastedVoteForRequest;
    mapping(uint256 => address[]) public votersByRequest;
    // Disputes
    mapping(uint256 => DataTypes.Dispute) public disputes;
    mapping(uint256 => mapping(address => bool)) public hasVotedOnDispute;
    mapping(uint256 => address[]) public disputeVoters;

    modifier onlyOpenRequest(uint256 requestId_) {
        DataTypes.Request storage req = requests[requestId_];
        require(
            block.timestamp <= req.deadline &&
                req.status == DataTypes.Status.OPEN,
            "Request not OPEN"
        );
        _;
    }

    constructor(address vot, uint256 charge, address[] memory accepted) {
        VOT = IERC20(vot);
        requestCharge = charge;
        for (uint i; i < accepted.length; ++i) {
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
    function numRequests() external view returns (uint256) {
        return _requestIdCounter.current() - 1;
    }

    /**
     * @notice Get proofs for request `requestId_`
     * @param requestId_ - the id of the request
     * @return Proof[] - a list of proofs
     */
    function getProofsByRequest(uint256 requestId_)
        external
        view
        returns (DataTypes.Proof[] memory)
    {
        return proofsByRequest[requestId_];
    }

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
    ) external payable {
        // burn VOT
        VOT.safeTransferFrom(_msgSender(), address(0), requestCharge);
        // check rewardAsset is whitelisted
        require(_acceptedRewards.contains(address(requestData.rewardAsset)), "Unsupported reward");
        _transferIn(
            requestData.rewardAsset,
            _msgSender(),
            requestData.rewardAmount
        );
        require(requestData.consumer.isConsumer(), "Not a consumer");
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
            minVotes: requestData.minVotes,
            // minSubmittedProofs: requestData.minSubmittedProofs, // TODO - good idea?
            consumer: requestData.consumer
        });
        if (requestData.answerType == DataTypes.AnswerType.STRING) {
            for (uint256 i; i < answers.length; ++i) {
                acceptedAnswersByRequest[requestId][i] = answers[i];
            }
        }
        _requestIdCounter.increment();
        emit NewRequest(_msgSender(), requestId);
    }

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
    ) external onlyOpenRequest(requestId_) {
        address verifier = _msgSender();
        require(
            proofVerifier[tokenId_] == address(0),
            "Proof already submitted"
        );
        require(
            !hasGivenProofToRequest[verifier][requestId_],
            "Cannot submit multiple proofs"
        );
        DataTypes.AnswerType answerType = requests[requestId_].answerType;
        if (answerType == DataTypes.AnswerType.BINARY) {
            require(answer_ == 0 || answer_ == 1, "Answer not valid");
        } else if (answerType == DataTypes.AnswerType.UINT) {
            string memory emptyString;
            require(
                keccak256(
                    abi.encode(acceptedAnswersByRequest[requestId_][answer_])
                ) != keccak256(abi.encode(emptyString)),
                "Answer not valid"
            );
        }
        DataTypes.Proof[] storage requestProofs = proofsByRequest[requestId_];
        proofVerifier[tokenId_] = verifier;
        uint256 proofIndex = requestProofs.length;
        requestProofs.push(
            DataTypes.Proof({
                verifier: verifier,
                tokenId: tokenId_,
                answer: answer_
            })
        );
        emit NewProof(verifier, requestId_, proofIndex);
    }

    /**
     * @notice Upvote proof `proofId_` of request `requestId_`
     * @dev requires prevous approval for spending of rewardAsset
     * @param requestId_ - the id of the request
     * @param proofId_ - the id of the proof
     */
    function upvoteProof(uint256 requestId_, uint256 proofId_)
        external
        payable
        onlyOpenRequest(requestId_)
    {
        DataTypes.Request memory req = requests[requestId_];
        _transferIn(req.rewardAsset, _msgSender(), _stakeAmountForRequest(req));
        require(
            !hasCastedVoteForRequest[requestId_][_msgSender()],
            "Vote already cast"
        );
        uint256 proofTokenId = proofsByRequest[requestId_][proofId_].tokenId;
        require(
            proofVerifier[proofTokenId] != _msgSender(),
            "Cannot upvote own proof"
        );
        votersByRequest[requestId_].push(_msgSender());
        votersByProofByRequest[requestId_][proofId_].push(_msgSender());
        hasCastedVoteForRequest[requestId_][_msgSender()] = true;
        hasVotedForProofToRequest[requestId_][proofId_][_msgSender()] = true;
        emit NewProofVote(_msgSender(), requestId_, proofId_);
        if (
            votersByProofByRequest[requestId_][proofId_].length == req.minVotes
        ) {
            req.status = DataTypes.Status.FULFILLED;
            req.electedProof = proofId_;
            requests[requestId_] = req;
            emit RequestAnswered(requestId_);
        }
        req.consumer.onRequestFulfilled(requestId_, req);
    }

    /**
     * @notice Reject the verification from the protocol and raise a dispute for request `requestId_`
     * @param requestId_ - the id of the request
     * @param reason_ - an explanation as to why the verification is rejected
     */
    function createDispute(uint256 requestId_, string calldata reason_)
        public
        payable
    {
        DataTypes.Request storage req = requests[requestId_];
        require(req.status == DataTypes.Status.FULFILLED, "Not Allowed");
        require(block.timestamp <= req.deadline + 7 days, "Not Allowed");
        // stake
        _transferIn(req.rewardAsset, _msgSender(), req.rewardAmount / 10);
        req.status = DataTypes.Status.DISPUTED;
        DataTypes.Dispute memory dispute = DataTypes.Dispute({
            creator: _msgSender(),
            reason: reason_,
            open: true,
            deadline: block.timestamp + 7 days,
            aye: 0,
            nay: 0
        });
        disputes[requestId_] = dispute;
        emit VerificationRejected(requestId_, reason_);
        req.consumer.onDisputeOpened(requestId_, req, dispute);
    }

    /**
     * @notice Abort the request `requestId_` and return any funds to their respective owners.
     * No proofs must have been submitted yet
     * @param requestId_ - the id of the request
     */
    function abortRequest(uint256 requestId_) external nonReentrant {
        DataTypes.Request storage req = requests[requestId_];
        require(_msgSender() == req.requester, "Not requester");
        require(proofsByRequest[requestId_].length == 0, "Cannot abort now");
        req.status = DataTypes.Status.ABORTED;
        _transferOut(req.rewardAsset, _msgSender(), req.rewardAmount);
        emit RequestAborted(requestId_);
    }

    /**
     * @notice Distribute rewards for a list of requests.
     * @dev can be "expensive" for the caller but allows to ditribute rewards for multiple requests more efficiently
     * given this runs on a cheap network like Polygon hyperefficient functions are not a necessity
     * @param requestIds - a list of requests to close
     */
    function closeFulfilledRequests(uint256[] calldata requestIds)
        external
        nonReentrant
    {
        uint256 loops = requestIds.length;
        for (uint256 i; i < loops; ++i) {
            uint256 id = requestIds[i];
            DataTypes.Request memory req = requests[id];
            require(
                req.deadline >= block.timestamp + 7 days,
                "Dipsute window still ongoing"
            );
            address verifier = proofsByRequest[id][req.electedProof].verifier;
            _transferOut(req.rewardAsset, verifier, req.rewardAmount / 2);
            _distributeFundsToVoters(
                id,
                req,
                req.rewardAmount / (2 * req.minVotes)
            );
            req.status = DataTypes.Status.CLOSED;
            requests[id] = req;
        }
    }

    /**
     * @notice Cast vote on dispute for `requestId_`. It is `aye_` that you agree the dispute is legit.
     * @param requestId_ - the id of the request the dispute belongs to
     * @param aye_ - wether you consider the dispute legit or not
     */
    function voteOnDispute(uint256 requestId_, bool aye_) public {
        DataTypes.Dispute memory dispute = disputes[requestId_];
        if (block.timestamp >= dispute.deadline) {
            // vote is ignored
            dispute.open = false;
            disputes[requestId_] = dispute;
            DataTypes.Request memory req = requests[requestId_];
            req.consumer.onDisputeCLosed(requestId_, req, dispute);
            return;
        }
        require(dispute.open, "Dispute closed");
        require(
            !hasVotedOnDispute[requestId_][_msgSender()],
            "Cannot vote twice"
        );
        require(
            requests[requestId_].requester != _msgSender(),
            "Cannot participate in dispute"
        );
        uint256 proofId = requests[requestId_].electedProof;
        require(
            proofsByRequest[requestId_][proofId].verifier != _msgSender(),
            "Cannot participate in dispute"
        );
        require(
            !hasVotedForProofToRequest[requestId_][proofId][_msgSender()],
            "Cannot participate in dispute"
        );

        aye_ ? dispute.aye++ : dispute.nay++;
        hasVotedOnDispute[requestId_][_msgSender()] = true;
        disputeVoters[requestId_].push(_msgSender());
        emit NewDisputeVote(_msgSender(), requestId_, aye_);
        disputes[requestId_] = dispute;
    }

    /**
     * @notice distribute rewards from disputes to whoever the receipients are
     * @dev this function can become "expensive" due to the multitude of loops
     * but considering the contract is on a cheap network like Polygon it should not be much of an issue
     * @param requestIds - a list of requests for which to distribute funds
     *
     * Logic
     * if the dispute ends without a clear winner: everyone gets their funds back (requester the reward, request voters & disputer their stake)
     */
    function distributeDisputeRewards(uint256[] calldata requestIds)
        public
        nonReentrant
    {
        uint256 loops = requestIds.length;
        for (uint256 i; i < loops; ++i) {
            uint256 id = requestIds[i];
            DataTypes.Request memory req = requests[id];
            require(
                req.status == DataTypes.Status.DISPUTED,
                "Request not disputed"
            );
            DataTypes.Dispute memory dispute = disputes[id];
            if (block.timestamp >= dispute.deadline) {
                voteOnDispute(id, false); // close the dispute, the vote is discarded anyways
            }
            if (dispute.nay == dispute.aye) {
                // return funds to request voters
                _distributeFundsToVoters(id, req, 0);
                // return funds to disputer
                _transferOut(
                    req.rewardAsset,
                    dispute.creator,
                    req.rewardAmount
                );
                // return funds to requester
                _transferOut(req.rewardAsset, req.requester, req.rewardAmount);
                req.status = DataTypes.Status.NULL;
                requests[id] = req;
                return;
                // dispute voters do not get anything as they were essentially useless
            } else {
                uint256 rewardToDisputeVoters = req.rewardAmount / 10; // 10% to dispute voters
                if (dispute.nay > dispute.aye) {
                    // If voters win, the reward is correctly distributed and staked funds are returned
                    // Funds to reward dispute voters will come from the stake of the disputer
                    address verifier = proofsByRequest[id][req.electedProof]
                        .verifier;
                    _transferOut(
                        req.rewardAsset,
                        verifier,
                        req.rewardAmount / 2
                    );
                    // return staked amount (+ reward portion if applicable) to all voters
                    _distributeFundsToVoters(
                        id,
                        req,
                        req.rewardAmount / (2 * req.minVotes)
                    );
                } else {
                    // If the disputer wins, 80% the reward is returned to the requester except 20% that is rewarded to the disputer for his service.
                    // Funds to reward dispute voters will come from the amount the request voters have staked
                    _transferOut(
                        req.rewardAsset,
                        req.requester,
                        req.rewardAmount * 8 / 10
                    );
                    _transferOut(
                        req.rewardAsset,
                        dispute.creator,
                        req.rewardAmount * 3 / 10 // what the disputer originally staked + 20% of the reward = 30% of the reward
                    );
                }
                    // ditribute rewards to dispute voters
                    address[] memory disputeVotersMem = disputeVoters[id];
                    uint256 numDisputeVoters = disputeVotersMem.length;
                    for (uint256 j; j < numDisputeVoters; ++j) {
                        _transferOut(
                            req.rewardAsset,
                            disputeVotersMem[j],
                            rewardToDisputeVoters / numDisputeVoters
                        );
                    }

            }
            req.status = DataTypes.Status.CLOSED;
            requests[id] = req;
        }
    }

    /////////////////////
    // INTERNAL FUNCTIONS
    /////////////////////

    /**
     * @notice returns the amount to stake in order to vote on proofs for the request
     * @param req - the request to calculate the amount for
     */
    function _stakeAmountForRequest(DataTypes.Request memory req)
        internal
        pure
        returns (uint256)
    {
        return req.rewardAmount / (10 * req.minVotes);
    }

    /**
     * @notice sends funds to accounts that participated in voting proofs for request `reqId`
     * @param reqId - the id of the request
     * @param req - the request itself
     * @param extraAmount - the additional amount to send to voters of the electedProof
     */
    function _distributeFundsToVoters(
        uint256 reqId,
        DataTypes.Request memory req,
        uint256 extraAmount
    ) internal {
        address[] memory voters = votersByRequest[reqId];
        uint256 numVoters = voters.length;
        for (uint256 j; j < numVoters; ++j) {
            uint256 amount = _stakeAmountForRequest(req);
            if (hasVotedForProofToRequest[reqId][req.electedProof][voters[j]]) {
                amount += extraAmount;
            }
            _transferOut(req.rewardAsset, voters[j], amount);
        }
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

    function setRequestCharge(uint charge) external onlyOwner {
        requestCharge = charge;
    }

    function toggleAcceptedAsset(address asset) external onlyOwner {
        if (_acceptedRewards.contains(asset)) {
            _acceptedRewards.remove(asset);
        } else {
            _acceptedRewards.add(asset);
        }
    }
}
