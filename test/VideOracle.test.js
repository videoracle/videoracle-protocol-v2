const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');

const wMATIC_ADDRESS = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
const DAI_ADDRESS = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';

describe('VideOracle', function () {
    async function deployContract() {
        const VideOracle = await ethers.getContractFactory('VideOracle');
        const [owner, addr1, addr2] = await ethers.getSigners();

        const videOracle = await VideOracle.deploy(
            addr1.address,
            BigNumber.from(`${1e9}`),
            [ethers.constants.AddressZero, wMATIC_ADDRESS]
        );
        await videOracle.deployed();
        return { VideOracle, videOracle, owner, addr1, addr2 };
    }
    describe('Deployment', function () {
        it('Should set the right owner', async function () {
            const { videOracle, owner } = await loadFixture(deployContract);
            expect(await videOracle.owner()).to.equal(owner.address);
        });

        it('Should set the right fee', async function () {
            const { videOracle } = await loadFixture(deployContract);
            expect(await videOracle.fee()).to.equal(BigNumber.from(`${1e9}`));
        });

        // it('Should set the right feesCollector', async function () {
        //     const { videOracle, addr1 } = await loadFixture(deployContract);
        //     expect(await videOracle.feesCollector()).to.equal(addr1);
        // });

        it('Should set the right acceptedRewards', async function () {
            const { videOracle } = await loadFixture(deployContract);
            const rewards = await videOracle.acceptedRewards();
            expect(rewards[0]).to.equal(ethers.constants.AddressZero);
            expect(rewards[1]).to.equal(wMATIC_ADDRESS);
        });
    });

    describe('Requests', function () {
        describe('Create', function () {
            it('Should revert with the right error if reward is not supported', async function () {
                const { videOracle } = await loadFixture(deployContract);
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
                expect(error.includes('Unsupported reward')).to.be.true;
            });

            /** TODO - test other validations:
             * wrong amount of MATIC sent
             * tx does not carry fee
             * not enough balance of ERC20 to pull (remember to approve spending first)
             * create requst with string answers but no accepted answers provided
             */
            it('Should succeed with binary answers', async function () {
                const { videOracle } = await loadFixture(deployContract);
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
                    console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
                expect(await videOracle.totalRequests()).to.be.equal(1);
            });

            it('Should succeed with integer answers', async function () {
                const { videOracle } = await loadFixture(deployContract);
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
                    console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
                expect(await videOracle.totalRequests()).to.be.equal(1);
            });

            it('Should succeed with string answers', async function () {
                const { videOracle } = await loadFixture(deployContract);
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

        describe('Abort', async function () {});
    });

    describe('Proofs', function () {
        describe('Submit', function () {
            it('Should revert with the right error if request expired', async function () {
                const { videOracle } = await loadFixture(deployContract);
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
                const { videOracle } = await loadFixture(deployContract);
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
                const { videOracle } = await loadFixture(deployContract);
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
                const { videOracle } = await loadFixture(deployContract);
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
                const { videOracle } = await loadFixture(deployContract);
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
                const { videOracle } = await loadFixture(deployContract);
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
                const { videOracle } = await loadFixture(deployContract);
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
                const { videOracle } = await loadFixture(deployContract);
                let error;
                try {
                    const req = [
                        0,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        Math.floor(Date.now() / 1000),
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
                const { videOracle } = await loadFixture(deployContract);
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
                const { videOracle } = await loadFixture(deployContract);
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
                const { videOracle, addr1 } = await loadFixture(deployContract);
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
        });
    });

    describe('Disputes', async function () {});

    // describe('Transfers', function () {
    //     it('Should transfer the funds to the owner', async function () {
    //         const { lock, unlockTime, lockedAmount, owner } = await loadFixture(
    //             deployOneYearLockFixture
    //         );

    //         await time.increaseTo(unlockTime);

    //         await expect(lock.withdraw()).to.changeEtherBalances(
    //             [owner, lock],
    //             [lockedAmount, -lockedAmount]
    //         );
    //     });
    // });
});
