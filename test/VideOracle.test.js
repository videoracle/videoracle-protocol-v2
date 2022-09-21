const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { BigNumber, constants } = require('ethers');


const DAI_ADDRESS = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';
const LINK_ADDRESS = '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39';

describe('VideOracle', function () {
    async function setup() {
        const VideOracle = await ethers.getContractFactory('VideOracle');
        const WNATIVE = await ethers.getContractFactory('WNATIVE');
        const [owner, addr1, addr2, addr3, addr4, addr5] =
            await ethers.getSigners();
        const WMatic = await WNATIVE.deploy();
        await WMatic.deployed();

        const videOracle = await VideOracle.deploy(
            addr1.address,
            BigNumber.from(`${1e9}`),
            [ethers.constants.AddressZero, WMatic.address, DAI_ADDRESS]
        );
        await videOracle.deployed();

        return {
            VideOracle,
            videOracle,
            owner,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
            WMatic,
        };
    }
    describe('Deployment', function () {
        it('Should set the right owner', async function () {
            const { videOracle, owner } = await loadFixture(setup);
            expect(await videOracle.owner()).to.equal(owner.address);
        });

        it('Should set the right fee', async function () {
            const { videOracle } = await loadFixture(setup);
            expect(await videOracle.fee()).to.equal(BigNumber.from(`${1e9}`));
        });

        it('Should set the right acceptedRewards', async function () {
            const { videOracle, WMatic } = await loadFixture(setup);
            const rewards = await videOracle.acceptedRewards();
            expect(rewards[0]).to.equal(ethers.constants.AddressZero);
            expect(rewards[1]).to.equal(WMatic.address);
            expect(rewards[2]).to.equal(DAI_ADDRESS);
        });
    });

    describe('Requests', function () {
        describe('Create', function () {
            it('Should revert with the right error if reward is not supported', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        LINK_ADDRESS,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Unsupported reward')).to.be.true;
            });

            it('Should revert with the right error if amount sent in is wrong', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${3 * 1e18}`),
                    });
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Invalid amount received')).to.be.true;
            });

            it('Should revert with the right error if creation tx does not carry fee', async function () {
                const { videOracle, WMatic } = await loadFixture(setup);
                await WMatic.deposit({
                    value: BigNumber.from(`${1e18}`),
                });
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        DAI_ADDRESS,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Not enough to pay fee')).to.be.true;
            });

            it('Should revert with the right error if reward is erc20 and approval is not given', async function () {
                const { videOracle, WMatic } = await loadFixture(setup);
                await WMatic.deposit({
                    value: BigNumber.from(`${1e18}`),
                });
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        WMatic.address,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e9}`),
                    });
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('SafeERC20: low-level call failed')).to.be
                    .true;
            });

            it('Should revert with the right error if reward is erc20 and Request does not have enough balance', async function () {
                const { videOracle, WMatic } = await loadFixture(setup);
                await WMatic.approve(
                    videOracle.address,
                    BigNumber.from(`${2 * 1e18}`)
                );
                await WMatic.deposit({
                    value: BigNumber.from(`${1e18}`),
                });
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        WMatic.address,
                        BigNumber.from(`${2 * 1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e9}`),
                    });
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('SafeERC20: low-level call failed')).to.be
                    .true;
            });

            it('Should revert with the right error if the request requires string answers but not enough accepted answers are given', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        2,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e9 + 1e18}`),
                    });
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Not enough answers provided')).to.be
                    .true;
            });

            /** TODO - test other validations:
             * tx does not carry fee
             * not enough balance of ERC20 to pull (remember to approve spending first)
             */
            it('Should succeed with binary answers', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    const tx = await videOracle.createRequest(
                        req,
                        acceptedAnswers,
                        {
                            value: BigNumber.from(`${1e18 + 1e9}`),
                        }
                    );
                    const receipt = await tx.wait();
                    const event = receipt.events.find(
                        ({ event }) => event == 'NewRequest'
                    );
                    expect(event).to.not.be.undefined;
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
                expect(await videOracle.totalRequests()).to.be.equal(1);
            });

            it('Should succeed with integer answers', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        1,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    const tx = await videOracle.createRequest(
                        req,
                        acceptedAnswers,
                        {
                            value: BigNumber.from(`${1e18 + 1e9}`),
                        }
                    );
                    const receipt = await tx.wait();
                    const event = receipt.events.find(
                        ({ event }) => event == 'NewRequest'
                    );
                    expect(event).to.not.be.undefined;
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
                expect(await videOracle.totalRequests()).to.be.equal(1);
            });

            it('Should succeed with string answers', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        2,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = ['foo', 'bar', 'baz'];
                    const tx = await videOracle.createRequest(
                        req,
                        acceptedAnswers,
                        {
                            value: BigNumber.from(`${1e18 + 1e9}`),
                        }
                    );
                    const receipt = await tx.wait();
                    const event = receipt.events.find(
                        ({ event }) => event == 'NewRequest'
                    );
                    expect(event).to.not.be.undefined;
                } catch (e) {
                    console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
                expect(await videOracle.totalRequests()).to.be.equal(1);
            });
        });

        describe('Read', async function () {
            /** TODO
             * .requests()
             * .acceptedAnswersByRequest()
             */
        });

        describe('Abort', async function () {
            it('Should revert if aborter is not requester', async function () {
                const { videOracle, addr1 } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.connect(addr1).abortRequest(0);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Not requester')).to.be.true;
            });

            it('Should revert if a proof has already been submitted', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.abortRequest(0);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Cannot abort now')).to.be.true;
            });

            it('Should succeed if the right conditions are met and return the reward to the requester', async function () {
                const { videOracle, owner } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    const tx = await videOracle.abortRequest(0);
                    const receipt = await tx.wait();
                    const event = receipt.events.find(
                        ({ event }) => event == 'RequestAborted'
                    );
                    expect(event).to.not.be.undefined;
                    const balanceAfter = await owner.provider.getBalance(
                        videOracle.address
                    );
                    console.log(balanceAfter);
                    // the reward is returned, the fee is kept
                    expect(balanceAfter.eq(BigNumber.from(`0`))).to.be
                        .true;
                } catch (e) {
                    console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
            });
        });
    });

    describe('Proofs', function () {
        describe('Submit', function () {
            it('Should revert with the right error if request expired', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) - 1e5, // in the past
                        2,
                    ];
                    const acceptedAnswers = [];
                    const tx = await videOracle.createRequest(
                        req,
                        acceptedAnswers,
                        {
                            value: BigNumber.from(`${1e18 + 1e9}`),
                        }
                    );
                    await videOracle.submitProof(0, 1, 1);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Request expired')).to.be.true;
            });

            it('Should revert with the right error if answer is not valid - binary', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    const tx = await videOracle.createRequest(
                        req,
                        acceptedAnswers,
                        {
                            value: BigNumber.from(`${1e18 + 1e9}`),
                        }
                    );
                    await videOracle.submitProof(0, 1, 2);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Answer not valid')).to.be.true;
            });

            it('Should revert with the right error if answer is not valid - string', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        2,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = ['foo', 'bar'];
                    const tx = await videOracle.createRequest(
                        req,
                        acceptedAnswers,
                        {
                            value: BigNumber.from(`${1e18 + 1e9}`),
                        }
                    );
                    await videOracle.submitProof(0, 1, 2);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Answer not valid')).to.be.true;
            });

            it('Should revert with the right error if submitting multiple proofs', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        2,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = ['foo', 'bar'];
                    const tx = await videOracle.createRequest(
                        req,
                        acceptedAnswers,
                        {
                            value: BigNumber.from(`${1e18 + 1e9}`),
                        }
                    );
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.submitProof(0, 1, 1);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Cannot submit multiple proofs')).to.be
                    .true;
            });

            it('Should succeed if correctly submitted - binary', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    const tx = await videOracle.submitProof(0, 1, 1);
                    const receipt = await tx.wait();
                    const event = receipt.events.find(
                        ({ event }) => event == 'NewProof'
                    );
                    expect(event).to.not.be.undefined;
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
            });

            it('Should succeed if correctly submitted - int', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        1,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    const tx = await videOracle.submitProof(0, 1, 1);
                    const receipt = await tx.wait();
                    const event = receipt.events.find(
                        ({ event }) => event == 'NewProof'
                    );
                    expect(event).to.not.be.undefined;
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
            });

            it('Should succeed if correctly submitted - string', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        2,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // 7 days from now
                        2,
                    ];
                    const acceptedAnswers = ['foo', 'bar'];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    const tx = await videOracle.submitProof(0, 1, 1);
                    const receipt = await tx.wait();
                    const event = receipt.events.find(
                        ({ event }) => event == 'NewProof'
                    );
                    expect(event).to.not.be.undefined;
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
                const proofData = await videOracle.proofsByRequest(0, 0);
                expect(proofData).to.not.be.undefined;
                const hasSubmittedProof =
                    await videOracle.hasGivenProofToRequest(
                        0,
                        proofData.verifier
                    );
                expect(hasSubmittedProof).to.be.true;
            });
        });
    });

    describe('Votes', async function () {
        describe('Upvote', async function () {
            it('Should revert with the right error if request is expired', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) - 1e5, // in the past
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.upvoteProof(0, 0);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Request expired')).to.be.true;
            });

            it('Should revert with the right error if no amount is staked', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.upvoteProof(0, 0);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Not enough staked')).to.be.true;
            });

            it('Should revert with the right error if one is upvoting their own proof', async function () {
                const { videOracle } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Cannot upvote own proof')).to.be.true;
            });

            it('Should revert with the right error if one is casting a second vote', async function () {
                const { videOracle, addr1 } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });
                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Vote already cast')).to.be.true;
            });

            it('Should succeed if the conditions are met', async function () {
                const { videOracle, addr1 } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    const tx = await videOracle
                        .connect(addr1)
                        .upvoteProof(0, 0, {
                            value: BigNumber.from(`${1e18 / 20}`),
                        });
                    const receipt = await tx.wait();
                    const event = receipt.events.find(
                        ({ event }) => event == 'NewProofVote'
                    );
                    expect(event).to.not.be.undefined;
                } catch (e) {
                    console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
            });
        });
    });

    describe('Disputes', async function () {
        describe('Create', async function () {
            it('Should revert with the right message if the request is not expired', async function () {
                const { videOracle, addr1 } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600 * 24 * 7,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });
                    await videOracle.createDispute(0, 'foobarbaz');
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Request not expired')).to.be.true;
            });

            it('Should revert with the right message if request was closed more than 3 days ago', async function () {
                const { videOracle, owner, addr1 } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });
                    await owner.provider.send('evm_increaseTime', [
                        10 * 24 * 3600 + 60,
                    ]);
                    await owner.provider.send('evm_mine');
                    await videOracle.createDispute(0, 'foobarbaz');
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('No longer disputable')).to.be.true;
            });

            it('Should revert if the disputer is not the requester', async function () {
                const { videOracle, addr1 } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });
                    await addr1.provider.send('evm_increaseTime', [3600]);
                    await addr1.provider.send('evm_mine');
                    await videOracle
                        .connect(addr1)
                        .createDispute(0, 'foobarbaz');
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Only requester can create dispute')).to
                    .be.true;
            });

            it('Should revert if the disputer if all voters elected the same proof', async function () {
                const { videOracle, addr1, addr2 } = await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);

                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr2).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await addr1.provider.send('evm_increaseTime', [3605]);
                    await addr1.provider.send('evm_mine');

                    await videOracle.createDispute(0, 'foobarbaz');
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(
                    error.includes(
                        'Dispute cannot be created as all voters voted for the elected proof'
                    )
                ).to.be.true;
            });

            it('Should revert if the disputer does not stake', async function () {
                const { videOracle, addr1, addr2, addr3, addr4 } =
                    await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr4).submitProof(0, 2, 0);

                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr2).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr3).upvoteProof(0, 1, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await addr1.provider.send('evm_increaseTime', [3605]);
                    await addr1.provider.send('evm_mine');

                    await videOracle.createDispute(0, 'foobarbaz');
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Not enough staked')).to.be.true;
            });

            it('Should succeed if the conditions are met', async function () {
                const { videOracle, addr1, addr2, addr3, addr4 } =
                    await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr4).submitProof(0, 2, 0);

                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr2).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr3).upvoteProof(0, 1, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await addr1.provider.send('evm_increaseTime', [3605]);
                    await addr1.provider.send('evm_mine');

                    const tx = await videOracle.createDispute(0, 'foobarbaz', {
                        value: BigNumber.from(`${1e17}`),
                    });
                    const receipt = await tx.wait();
                    const event = receipt.events.find(
                        ({ event }) => event == 'VerificationRejected'
                    );
                    expect(event).to.not.be.undefined;
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
            });
        });

        describe('Vote', async function () {
            it('Should revert with the right message if the dispute is closed', async function () {
                const { videOracle, addr1, addr2, addr3, addr4 } =
                    await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr4).submitProof(0, 2, 0);

                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr2).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr3).upvoteProof(0, 1, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await addr1.provider.send('evm_increaseTime', [3605]);
                    await addr1.provider.send('evm_mine');

                    await videOracle.createDispute(0, 'foobarbaz', {
                        value: BigNumber.from(`${1e17}`),
                    });

                    await addr1.provider.send('evm_increaseTime', [
                        3 * 24 * 3600 + 60,
                    ]);
                    await addr1.provider.send('evm_mine');

                    await videOracle.connect(addr1).voteOnDispute(0, true);
                    await videOracle.connect(addr1).voteOnDispute(0, true);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Dispute closed')).to.be.true;
            });

            it('Should revert with the right message if casting a second vote on the dispute', async function () {
                const { videOracle, addr1, addr2, addr3, addr4 } =
                    await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr4).submitProof(0, 2, 0);

                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr2).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr3).upvoteProof(0, 1, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await addr1.provider.send('evm_increaseTime', [3605]);
                    await addr1.provider.send('evm_mine');

                    await videOracle.createDispute(0, 'foobarbaz', {
                        value: BigNumber.from(`${1e17}`),
                    });

                    await videOracle.connect(addr3).voteOnDispute(0, true);
                    await videOracle.connect(addr3).voteOnDispute(0, true);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Cannot vote twice')).to.be.true;
            });

            it('Should revert with the right message if voter is original requester', async function () {
                const { videOracle, addr1, addr2, addr3, addr4 } =
                    await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr4).submitProof(0, 2, 0);

                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr2).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr3).upvoteProof(0, 1, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await addr1.provider.send('evm_increaseTime', [3605]);
                    await addr1.provider.send('evm_mine');

                    await videOracle.createDispute(0, 'foobarbaz', {
                        value: BigNumber.from(`${1e17}`),
                    });

                    await videOracle.voteOnDispute(0, true);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Cannot participate in dispute')).to.be
                    .true;
            });

            it('Should revert with the right message if voter is the electedProof verifier', async function () {
                const { videOracle, addr1, addr2, addr3, addr4, addr5 } =
                    await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.connect(addr5).submitProof(0, 1, 1);
                    await videOracle.connect(addr4).submitProof(0, 2, 0);

                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr2).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr3).upvoteProof(0, 1, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await addr1.provider.send('evm_increaseTime', [3605]);
                    await addr1.provider.send('evm_mine');

                    await videOracle.createDispute(0, 'foobarbaz', {
                        value: BigNumber.from(`${1e17}`),
                    });

                    await videOracle.connect(addr5).voteOnDispute(0, true);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Cannot participate in dispute')).to.be
                    .true;
            });

            it('Should revert with the right message if dispute voter did not participate in request', async function () {
                const { videOracle, addr1, addr2, addr3, addr4, addr5 } =
                    await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr4).submitProof(0, 2, 0);

                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr2).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr3).upvoteProof(0, 1, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await addr1.provider.send('evm_increaseTime', [3605]);
                    await addr1.provider.send('evm_mine');

                    await videOracle.createDispute(0, 'foobarbaz', {
                        value: BigNumber.from(`${1e17}`),
                    });

                    await videOracle.connect(addr5).voteOnDispute(0, true);
                } catch (e) {
                    // console.log(e);
                    error = `${e}`;
                }
                expect(error).to.not.be.undefined;
                expect(error.includes('Cannot participate in dispute')).to.be
                    .true;
            });

            it('Should succeed if the right conditions are met', async function () {
                const { videOracle, addr1, addr2, addr3, addr4, addr5 } =
                    await loadFixture(setup);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000) + 3600,
                        2,
                    ];
                    const acceptedAnswers = [];
                    await videOracle.createRequest(req, acceptedAnswers, {
                        value: BigNumber.from(`${1e18 + 1e9}`),
                    });
                    await videOracle.submitProof(0, 1, 1);
                    await videOracle.connect(addr4).submitProof(0, 2, 0);

                    await videOracle.connect(addr1).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr2).upvoteProof(0, 0, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await videOracle.connect(addr3).upvoteProof(0, 1, {
                        value: BigNumber.from(`${1e18 / 20}`),
                    });

                    await addr1.provider.send('evm_increaseTime', [3605]);
                    await addr1.provider.send('evm_mine');

                    await videOracle.createDispute(0, 'foobarbaz', {
                        value: BigNumber.from(`${1e17}`),
                    });

                    const tx = await videOracle
                        .connect(addr3)
                        .voteOnDispute(0, true);
                    const receipt = await tx.wait();
                    const event = receipt.events.find(
                        ({ event }) => event == 'NewDisputeVote'
                    );
                    expect(event).to.not.be.undefined;
                } catch (e) {
                    console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
            });
        });
    });

    describe('Claims', async function () {
        it('Should dispatch funds when calling claimAsVerifier()', async function () {
            const { videOracle, addr1, addr2, addr3 } = await loadFixture(setup);
            let error;
            try {
                const req = [
                    0,
                    'body of request',
                    'lat:xx,xxxx,long:-xx,xxx',
                    ethers.constants.AddressZero,
                    BigNumber.from(`${1e18}`),
                    Math.floor(Date.now() / 1000) + 3600,
                    2,
                ];
                const acceptedAnswers = [];
                await videOracle.createRequest(req, acceptedAnswers, {
                    value: BigNumber.from(`${1e18 + 1e9}`),
                });
                await videOracle.connect(addr3).submitProof(0, 1, 1);
                await videOracle.connect(addr1).upvoteProof(0, 0, {
                    value: BigNumber.from(`${1e18 / 20}`),
                });

                await videOracle.connect(addr2).upvoteProof(0, 0, {
                    value: BigNumber.from(`${1e18 / 20}`),
                });
                await addr1.provider.send('evm_increaseTime', [
                    3 * 24 * 3600 + 3605,
                ]);
                await addr1.provider.send('evm_mine');

                const tx = await videOracle
                    .connect(addr3)
                    .claimFundsAsVerifier([0]);
                const receipt = await tx.wait();
                const event = receipt.events.find(
                    ({ event }) => event == 'Claim'
                );
                expect(event.args['amount'].eq(BigNumber.from(`${1e18 / 2}`)))
                    .to.be.true;
            } catch (e) {
                console.log(e);
                error = `${e}`;
            }
            expect(error).to.be.undefined;
        })
        
        it('Should dispatch funds when calling claimAsVoter()', async function () {
            const { videOracle, addr1, addr2, addr3 } = await loadFixture(
                setup
            );
            let error;
            try {
                const balanceBefore = await addr1.provider.getBalance(
                    addr3.address
                );
                console.log(balanceBefore);
                const req = [
                    0,
                    'body of request',
                    'lat:xx,xxxx,long:-xx,xxx',
                    ethers.constants.AddressZero,
                    BigNumber.from(`${5 * 1e18}`),
                    Math.floor(Date.now() / 1000) + 3600,
                    2,
                ];
                const acceptedAnswers = [];
                await videOracle.createRequest(req, acceptedAnswers, {
                    value: BigNumber.from(`${5 * 1e18 + 1e9}`),
                });
                await videOracle.connect(addr3).submitProof(0, 1, 1);
                await videOracle.connect(addr1).upvoteProof(0, 0, {
                    value: BigNumber.from(`${(5 * 1e18) / 20}`),
                });

                await videOracle.connect(addr2).upvoteProof(0, 0, {
                    value: BigNumber.from(`${(5 * 1e18) / 20}`),
                });
                await addr1.provider.send('evm_increaseTime', [
                    3 * 24 * 3600 + 3605,
                ]);
                await addr1.provider.send('evm_mine');

                const tx = await videOracle
                    .connect(addr1)
                    .claimFundsAsVoter([0]);
                const receipt = await tx.wait();
                // console.log(receipt.events);
                const events = receipt.events.filter(
                    ({ event }) => event == 'Claim'
                );
                expect(events.length > 0).to.be.true;
                expect(
                    events[0].args['amount'].eq(
                        BigNumber.from(`${(5 * 1e18) / 4}`).add(
                            BigNumber.from(`${(5 * 1e18) / 20}`)
                        )
                    )
                ).to.be.true;
            } catch (e) {
                console.log(e);
                error = `${e}`;
            }
            expect(error).to.be.undefined;
        });

        it('Should dispatch funds when calling claimAsRequester()', async function () {
            const { videOracle, addr1, addr2, addr3, addr4, addr5 } =
                await loadFixture(setup);
            let error;
            try {
                const req = [
                    0,
                    'body of request',
                    'lat:xx,xxxx,long:-xx,xxx',
                    ethers.constants.AddressZero,
                    BigNumber.from(`${1e18}`),
                    Math.floor(Date.now() / 1000) + 3600,
                    2,
                ];
                const acceptedAnswers = [];
                await videOracle.createRequest(req, acceptedAnswers, {
                    value: BigNumber.from(`${1e18 + 1e9}`),
                });
                await videOracle.submitProof(0, 1, 1);
                await videOracle.connect(addr4).submitProof(0, 2, 0);

                await videOracle.connect(addr1).upvoteProof(0, 0, {
                    value: BigNumber.from(`${1e18 / 20}`),
                });

                await videOracle.connect(addr2).upvoteProof(0, 0, {
                    value: BigNumber.from(`${1e18 / 20}`),
                });

                await videOracle.connect(addr3).upvoteProof(0, 1, {
                    value: BigNumber.from(`${1e18 / 20}`),
                });

                await addr1.provider.send('evm_increaseTime', [3605]);
                await addr1.provider.send('evm_mine');

                await videOracle.createDispute(0, 'foobarbaz', {
                    value: BigNumber.from(`${1e17}`),
                });
                await videOracle.connect(addr3).voteOnDispute(0, true);

                await addr1.provider.send('evm_increaseTime', [
                    3 * 24 * 3600 + 5,
                ]);
                await addr1.provider.send('evm_mine');

                const tx = await videOracle.claimFundsAsRequester([0]);

                const receipt = await tx.wait();
                const events = receipt.events.filter(
                    ({ event }) => event == 'Claim'
                );
                expect(events.length > 0).to.be.true;
                // console.log(events)
                expect(
                    events[0].args['amount'].eq(
                        BigNumber.from(`${1e18 + 1e17}`)
                    )
                ).to.be.true;
            } catch (e) {
                console.log(e);
                error = `${e}`;
            }
            expect(error).to.be.undefined;
        });

    });
});
