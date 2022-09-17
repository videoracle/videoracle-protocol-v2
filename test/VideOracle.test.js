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

    describe('Create Request', function () {
        describe('Validations', function () {
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
                        new Date().getDate() + 1000 * 3600 * 24 * 7, // 7 days from now
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
             */

            it('Should go through with string answers', async function () {
                const { videOracle } = await loadFixture(deployContract);
                let error;
                try {
                    const req = [
                        2,
                        'body of request',
                        'lat:xx,xxxx,long:-xx,xxx',
                        ethers.constants.AddressZero,
                        BigNumber.from(`${1e18}`),
                        new Date().getDate() + 1000 * 3600 * 24 * 7, // 7 days from now
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
                } catch (e) {
                    console.log(e);
                    error = `${e}`;
                }
                expect(error).to.be.undefined;
                expect(await videOracle.totalRequests()).to.be.equal(1);
                // TODO - check event
            });
        });

        // describe('Events', function () {
        //     it('Should emit an event on withdrawals', async function () {
        //         const { lock, unlockTime, lockedAmount } = await loadFixture(
        //             deployOneYearLockFixture
        //         );

        //         await time.increaseTo(unlockTime);

        //         await expect(lock.withdraw())
        //             .to.emit(lock, 'Withdrawal')
        //             .withArgs(lockedAmount, anyValue); // We accept any value as `when` arg
        //     });
        // });

        // describe('Transfers', function () {
        //     it('Should transfer the funds to the owner', async function () {
        //         const { lock, unlockTime, lockedAmount, owner } =
        //             await loadFixture(deployOneYearLockFixture);

        //         await time.increaseTo(unlockTime);

        //         await expect(lock.withdraw()).to.changeEtherBalances(
        //             [owner, lock],
        //             [lockedAmount, -lockedAmount]
        //         );
        //     });
        // });
    });
});
