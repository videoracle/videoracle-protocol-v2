// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
// import {Address} from "@openzeppelin/contracts/utils/Address.sol";
// import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
// import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// interface IVideOracle  {
//     using Address for address;
//     using Counters for Counters.Counter;

//     event NewRequest(address indexed src, uint256 requestId);
//     event NewProof(address indexed src, uint256 requestId, uint256 proofId);
//     event NewProofVote(address indexed src, uint256 requestId, uint256 proofId);
//     event RequestPendingValidation(uint256 requestId);
//     event RequestAborted(uint256 requestId);
//     event VerificationAccepted(uint256 requestId);
//     event VerificationRejected(uint256 requestId, string reason);
//     event NewDisputeVote(address indexed src, uint256 requestId, bool aye);

//     enum Status {
//         OPEN,
//         PENDING_VALIDATION,
//         ABORTED,
//         FULFILLED,
//         DISPUTED,
//         CLOSED
//     }

//     struct Request {
//         address requester;
//         string body;
//         string coordinates; // lat:<Number>,lon:<Number>
//         uint256 reward;
//         uint256 deadline;
//         uint256 minVotes;
//         Status status;
//         uint256 electedProof;
//     }

//     struct Proof {
//         address verifier;
//         uint256 tokenId;
//     }

//     struct Dispute {
//         string reason;
//         bool open;
//         uint256 deadline;
//         uint256 aye; // agree with the rejection
//         uint256 nay; // disagree with the rejection
//     }

//     Counters.Counter internal _requestIdCounter;
//     // Requests
//     // mapping(uint256 => Request) public requests;
//     function requests(uint id) external view returns (Request memory);
//     // Proofs
//     // mapping(uint256 => Proof[]) public proofsByRequest;
//     function proofByRequest(uint reqId) external view returns (Proof[] memory);
//     mapping(uint uint256 => address) public proofVerifier;
//     mapping(address => mapping(uint256 => bool)) public hasGivenProofToRequest;
//     // Votes
//     mapping(uint256 => mapping(uint256 => address[]))
//         public votersByProofByRequest;
//     mapping(uint256 => mapping(uint256 => mapping(address => bool)))
//         public hasVotedForProofToRequest;
//     mapping(uint256 => mapping(address => bool)) public hasCastedVoteForRequest;
//     mapping(uint256 => address[]) public votersByRequest;
//     // Disputes
//     mapping(uint256 => Dispute) public disputes;
//     mapping(uint256 => mapping(address => bool)) public hasVotedOnDispute;
//     mapping(uint256 => address[]) public disputeVoters;

//     modifier onlyOpenRequest(uint256 requestId_) {
//         Request storage req = requests[requestId_];
//         require(
//             block.timestamp <= req.deadline && req.status == Status.OPEN,
//             "Request not OPEN"
//         );
//         _;
//     }

//     /**
//      * @notice get the number of submitted requests
//      * @return uint
//      */
//     function numRequests() external view returns (uint256) {
//         return _requestIdCounter.current() - 1;
//     }

//     /**
//      * @notice Get data for request `requestId_`
//      * @param requestId_ - the id of the request
//      * @return Request - the data for the request
//      */
//     function getRequest(uint256 requestId_)
//         external
//         view
//         returns (Request memory)
//     {
//         Request memory req = requests[requestId_];
//         return req;
//     }

//     /**
//      * @notice Get proofs for request `requestId_`
//      * @param requestId_ - the id of the request
//      * @return Proof[] - a list of proofs
//      */
//     function getProofsByRequest(uint256 requestId_)
//         external
//         view
//         returns (Proof[] memory)
//     {
//         Proof[] memory proofs = proofsByRequest[requestId_];
//         return proofs;
//     }

//     /**
//      * @notice create a request.
//      * In order to accommodate a potential dispute 110% of the reward is required.
//      * The extra will be returned in case of no dispute or winning the dispute.
//      * @param requestData - data necessary to fulfill the request
//      */
//     function createRequest(Request memory requestData) external payable {
//         // send in 110% of reard in case a dipsute is opened and lost
//         require(
//             (requestData.reward * 11) / 10 == msg.value,
//             "Wrong value sent"
//         );
//         uint256 requestId = _requestIdCounter.current();
//         requestData.status = Status.OPEN;
//         requestData.requester = _msgSender();
//         requestData.electedProof = type(uint256).max;
//         requests[requestId] = requestData;
//         _requestIdCounter.increment();
//         emit NewRequest(_msgSender(), requestId);
//     }

//     /**
//      * @notice Submit videoNFT with id `tokenId_` as proof to the request `requestId_`
//      * @dev a VideoNFT must have been minted through LivePeer's VideoNFT contract
//      * @param requestId_ - the id of the request
//      * @param tokenId_ - the tokenId from the VideoNFT contract
//      */
//     function submitProof(uint256 requestId_, uint256 tokenId_)
//         external
//         onlyOpenRequest(requestId_)
//     {
//         address verifier = _msgSender();
//         require(
//             proofVerifier[tokenId_] == address(0),
//             "Proof already submitted"
//         );
//         require(
//             !hasGivenProofToRequest[verifier][requestId_],
//             "Cannot submit multiple proofs"
//         );
//         Proof[] storage requestProofs = proofsByRequest[requestId_];
//         proofVerifier[tokenId_] = verifier;
//         uint256 proofIndex = requestProofs.length;
//         requestProofs.push(Proof({verifier: verifier, tokenId: tokenId_}));
//         emit NewProof(verifier, requestId_, proofIndex);
//     }

//     /**
//      * @notice Upvote proof `proofId_` of request `requestId_`
//      * @param requestId_ - the id of the request
//      * @param proofId_ - the id of the proof
//      */
//     function upvoteProof(uint256 requestId_, uint256 proofId_)
//         external
//         payable
//         onlyOpenRequest(requestId_)
//     {
//         Request memory req = requests[requestId_];
//         require(
//             msg.value == stakeAmountForRequest(req),
//             "Insufficient funds staked"
//         );
//         require(
//             !hasCastedVoteForRequest[requestId_][_msgSender()],
//             "Vote already cast"
//         );
//         uint256 proofTokenId = proofsByRequest[requestId_][proofId_].tokenId;
//         require(
//             proofVerifier[proofTokenId] != _msgSender(),
//             "Cannot upvote own proof"
//         );
//         votersByRequest[requestId_].push(_msgSender());
//         votersByProofByRequest[requestId_][proofId_].push(_msgSender());
//         hasCastedVoteForRequest[requestId_][_msgSender()] = true;
//         hasVotedForProofToRequest[requestId_][proofId_][_msgSender()] = true;
//         emit NewProofVote(_msgSender(), requestId_, proofId_);
//         if (
//             votersByProofByRequest[requestId_][proofId_].length == req.minVotes
//         ) {
//             req.status = Status.PENDING_VALIDATION;
//             req.electedProof = proofId_;
//             requests[requestId_] = req;
//             emit RequestPendingValidation(requestId_);
//         }
//     }

//     /**
//      * @notice Accept he verification from the protocol
//      * @param requestId_ - the id of the request
//      */
//     function acceptVerification(uint256 requestId_) external {
//         Request storage req = requests[requestId_];
//         require(_msgSender() == req.requester, "Not requester");
//         require(
//             req.status == Status.PENDING_VALIDATION,
//             "Not pending validation"
//         );
//         req.status = Status.FULFILLED;
//         Address.sendValue(payable(_msgSender()), req.reward / 10); // send 10% of reward back to requester
//         emit VerificationAccepted(requestId_);
//     }

//     /**
//      * @notice Reject the verification from the protocol and raise a dispute for request `requestId_`
//      * @param requestId_ - the id of the request
//      * @param reason_ - an explanation as to why the verification is reected
//      */
//     function rejectVerification(uint256 requestId_, string calldata reason_)
//         public
//     {
//         Request storage req = requests[requestId_];
//         require(_msgSender() == req.requester, "Not requester");
//         req.status = Status.DISPUTED;
//         disputes[requestId_] = Dispute({
//             reason: reason_,
//             open: true,
//             deadline: block.timestamp + 7 days,
//             aye: 0,
//             nay: 0
//         });
//         emit VerificationRejected(requestId_, reason_);
//     }

//     /**
//      * @notice Abort the request `requestId_` and return any funds to their respective owners.
//      * The request deadline must have passed
//      * @param requestId_ - the id of the request
//      */
//     function abortRequest(uint256 requestId_) external nonReentrant {
//         Request storage req = requests[requestId_];
//         require(_msgSender() == req.requester, "Not requester");
//         require(
//             block.timestamp >= req.deadline && req.status == Status.OPEN,
//             "Cannot abort now"
//         );
//         req.status = Status.ABORTED;
//         Address.sendValue(payable(_msgSender()), req.reward);
//         distributeFundsToVoters(requestId_, req, 0);
//         emit RequestAborted(requestId_);
//     }

//     /**
//      * @notice Distribute rewards for a list of requests.
//      * @dev can be "expensive" for the caller but allows to ditribute rewards for multiple requests more efficiently
//      * given this runs on a cheap network like Polygon hyperefficient functions are not a necessity
//      * @param requestIds - a list of requests to close
//      */
//     function closeFulfilledRequests(uint256[] calldata requestIds)
//         external
//         nonReentrant
//     {
//         uint256 loops = requestIds.length;
//         for (uint256 i; i < loops; ++i) {
//             uint256 id = requestIds[i];
//             Request memory req = requests[id];
//             require(req.status == Status.FULFILLED, "Request not fulfilled");
//             address verifier = proofsByRequest[id][req.electedProof].verifier;
//             Address.sendValue(payable(verifier), req.reward / 2);
//             distributeFundsToVoters(id, req, req.reward / (2 * req.minVotes));
//             req.status = Status.CLOSED;
//             requests[id] = req;
//         }
//     }

//     /**
//      * @notice Cast vote on dispute for `requestId_`. It is `aye_` that you agree the dispute is legit.
//      * @param requestId_ - the id of the request the dispute belongs to
//      * @param aye_ - wether you consider the dispute legit or not
//      */
//     function voteOnDispute(uint256 requestId_, bool aye_) public {
//         Dispute memory dispute = disputes[requestId_];
//         require(dispute.open, "Dispute closed");
//         require(
//             !hasVotedOnDispute[requestId_][_msgSender()],
//             "Cannot vote twice"
//         );
//         require(
//             requests[requestId_].requester != _msgSender(),
//             "Cannot participate in dispute"
//         );
//         uint256 proofId = requests[requestId_].electedProof;
//         require(
//             proofsByRequest[requestId_][proofId].verifier != _msgSender(),
//             "Cannot participate in dispute"
//         );
//         require(
//             !hasVotedForProofToRequest[requestId_][proofId][_msgSender()],
//             "Cannot participate in dispute"
//         );

//         aye_ ? dispute.aye++ : dispute.nay++;
//         hasVotedOnDispute[requestId_][_msgSender()] = true;
//         disputeVoters[requestId_].push(_msgSender());
//         emit NewDisputeVote(_msgSender(), requestId_, aye_);

//         if (block.timestamp >= dispute.deadline) {
//             dispute.open = false;
//         }
//         disputes[requestId_] = dispute;
//     }

//     /**
//      * @notice distribute rewards from disputes to whoever the receipients are
//      * @dev this function can become "expensive" due to the multitude of loops
//      * but considering the contract is on a cheap netwokr like Polygon it should not be much of an issue
//      * @param requestIds - a list of requests for which to distribute funds
//      */
//     function distributeDisputeRewards(uint256[] calldata requestIds)
//         public
//         nonReentrant
//     {
//         uint256 loops = requestIds.length;
//         for (uint256 i; i < loops; ++i) {
//             uint256 id = requestIds[i];
//             Request memory req = requests[id];
//             require(req.status == Status.DISPUTED, "Request not disputed");
//             Dispute memory dispute = disputes[id];
//             require(!dispute.open, "Dispute still ongoing");
//             uint256 rewardToDisputeVoters = req.reward / 10; // 10% to dispute voters
//             if (dispute.nay == dispute.aye) {
//                 distributeFundsToVoters(id, req, 0);
//                 Address.sendValue(payable(req.requester), req.reward);
//             } else {
//                 if (dispute.nay > dispute.aye) {
//                     // If voters win, the reward is correctly distributed and staked funds are returned
//                     // Funds to reward dispute voters will come from the extra amount the requester initially deposited
//                     address verifier = proofsByRequest[id][req.electedProof]
//                         .verifier;
//                     Address.sendValue(payable(verifier), req.reward / 2);
//                     // return staked amount (+ reward portion if applicable) to all voters
//                     distributeFundsToVoters(
//                         id,
//                         req,
//                         req.reward / (2 * req.minVotes)
//                     );
//                 } else {
//                     // If the requester wins, the reward and the extra is returned to the requester.
//                     // Funds to reward dispute voters will come from the amount request voters have staked
//                     Address.sendValue(
//                         payable(req.requester),
//                         (req.reward * 11) / 10
//                     );
//                 }
//                 // ditribute rewards to dispute voters
//                 address[] memory disputeVotersMem = disputeVoters[id];
//                 uint256 numDisputeVoters = disputeVotersMem.length;
//                 for (uint256 j; j < numDisputeVoters; ++j) {
//                     Address.sendValue(
//                         payable(disputeVotersMem[j]),
//                         rewardToDisputeVoters / numDisputeVoters
//                     );
//                 }
//             }
//             req.status = Status.CLOSED;
//             requests[id] = req;
//         }
//     }

//     /**
//      * @notice returns the amount to stake in order to vote on proofs for the request
//      * @param req - the request to calculate the amount for
//      */
//     function stakeAmountForRequest(Request memory req)
//         internal
//         pure
//         returns (uint256)
//     {
//         return req.reward / (10 * req.minVotes);
//     }

//     /**
//      * @notice sends funds to accounts that participated in voting proofs for request `reqId`
//      * @param reqId - the id of the request
//      * @param req - the request itself
//      * @param extraAmount - the additional amount to send to voters of the electedProof
//      */
//     function distributeFundsToVoters(
//         uint256 reqId,
//         Request memory req,
//         uint256 extraAmount
//     ) internal {
//         address[] memory voters = votersByRequest[reqId];
//         uint256 numVoters = voters.length;
//         for (uint256 j; j < numVoters; ++j) {
//             uint256 amount = stakeAmountForRequest(req);
//             if (hasVotedForProofToRequest[reqId][req.electedProof][voters[j]]) {
//                 amount += extraAmount;
//             }
//             Address.sendValue(payable(voters[j]), amount);
//         }
//     }
// }
