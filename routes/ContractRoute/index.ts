// <reference types="@types/tronweb" />
// @ts-expect-error
import { TronWeb } from "tronweb";
import { Router } from "express";
import { ZeroAddress, id } from "ethers";
import Web3 from "web3";
import {
  APEX_ABI,
  APEX_ADDRESS,
  ERC20_ABI,
  REFERRAL_EVENT,
  USDT_ADDRESS,
  USERCLAIMED_EVENT,
  USERSTAKED_EVENT,
  USERUNSTAKED_EVENT,
  REFERRAL_BONUS_EVENT,
  VOTE_CREATED_EVENT,
  USER_COMPOUND_EVENT,
  REWARD_POOL_ABI,
  POOL_ADDRESS,
} from "../../config";
import { authMiddleware, AuthRequest } from "../../middleware";
import User from "../../model/UserModel";
import TxModel from "../../model/TxModel";
import { getUserWallet } from "../WalletRoute";
import { TRON_NODE, getAccountDetails } from "../WalletRoute/wallet";
import { getTokenBalance, handleError, infura } from "./contract";
import UserModel from "../../model/UserModel";
import StakingModel from "../../model/StakingModel";
import VoteModel from "../../model/VoteModel";
import TradingModel from "../../model/TradingHistoryModel";
import LevelModel from "../../model/LevelModel";
import NotificationModel from "../../model/NotificationModel";
import { CHAIN_LIST, UNIT } from "../../config/config";
import { IStakingResult } from "../../config/types";

// Create a new instance of the Express Router
const ContractRouter = Router();

// @route    POST api/contract/stake *
// @desc     stake
// @access   Private
ContractRouter.post("/stake", authMiddleware, async (req: AuthRequest, res) => {
  console.log("Stake");
  try {
    const { amount, chainId } = req.body;
    const { id: userId } = req.user;
    const { exist, mnemonic } = await getUserWallet(userId);
    if (exist) {
      const user = await User.findById(userId);
      let referrer;
      if (user?.referrerId) referrer = await User.findById(user.referrerId);
      const walletDetail = getAccountDetails(mnemonic);
      // chainid
      const infuraUrl = infura(chainId);
      const web3 = new Web3(infuraUrl);
      const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

      let referrerAddress = ZeroAddress;
      if (referrer && referrer.mnemonic) {
        // chainid
        referrerAddress = getAccountDetails(
          referrer.mnemonic
        ).eth_wallet_address;
      }

      try {
        const gasPrice = await web3.eth.getGasPrice();
        console.log(`gasPrice ${gasPrice}`);
        // chainid
        const usdtContract = new web3.eth.Contract(
          ERC20_ABI,
          USDT_ADDRESS[chainId]
        );
        const approveTxData = usdtContract.methods
          .approve(
            // @ts-ignore
            contract.options.address,
            amount
          )
          .encodeABI();
        const approveTxObj = {
          from: walletDetail.eth_wallet_address,
          to: usdtContract.options.address,
          data: approveTxData,
        };
        const approveGas = await web3.eth.estimateGas(approveTxObj);
        console.log(`approve: approveGas ${approveGas}`);

        const approveTx = await web3.eth.accounts.signTransaction(
          { ...approveTxObj, gas: approveGas, gasPrice },
          walletDetail.eth_wallet_privateKey
        );

        await web3.eth.sendSignedTransaction(approveTx.rawTransaction);

        const txData = contract.methods
          .stake(
            // @ts-ignore
            amount,
            referrerAddress
          )
          .encodeABI();
        const txObj = {
          from: walletDetail.eth_wallet_address,
          to: contract.options.address,
          data: txData,
        };

        const gas = await web3.eth.estimateGas(txObj);
        console.log(`gas ${gas}`);

        const sTx = await web3.eth.accounts.signTransaction(
          { ...txObj, gas, gasPrice },
          walletDetail.eth_wallet_privateKey
        );

        const rept = await web3.eth.sendSignedTransaction(sTx.rawTransaction);
        console.log(`New Stake ${rept.transactionHash} is occurred`);

        const eventId = web3.eth.abi.encodeEventSignature(USERSTAKED_EVENT);
        const logs = rept.logs.filter((log: any) => log.topics[0] === eventId);
        const results = logs.map(
          (log: any) =>
            web3.eth.abi.decodeLog(
              USERSTAKED_EVENT.inputs,
              log.data.toString(),
              log.topics.map((t: any) => t.toString())
            ) as unknown as IStakingResult
        );
        const { count, stakedAmount, time, period } = results[0];

        if (rept.status.toString() === "1") {
          console.log(`New stake successfully`);
          await TxModel.create({
            userId,
            chainId,
            action: "stake",
            amount: stakedAmount.toString(),
            date: new Date(new Date().toUTCString()).getTime(),
            hash: rept.transactionHash,
            status: "Complete",
          });
          const newStaking = await StakingModel.create({
            userId,
            chainId,
            amount: stakedAmount.toString(),
            claimTime: Number(time),
            count: Number(count),
            date: Number(time),
            duration: Number(period),
          });

          const userInfo: any[] = await contract.methods
            .getUserTotal(
              // @ts-ignore
              walletDetail.eth_wallet_address
            )
            .call();

          const level = userInfo[4]
          if (chainId === 0) {
            const original = await LevelModel.findOne({ userId })
            const originlevel = original
            if (Number(originlevel) != Number(original)) {

              await LevelModel.findOneAndUpdate(userId)
            }
          }

          return res.json({
            msg: "success",
          });
        } else {
          console.log(`Stake transaction failed`);
          await TxModel.create({
            hash: rept.transactionHash,
            action: "stake",
            amount,
            chainId,
            userId,
            date: new Date(new Date().toUTCString()).getTime(),
            status: "Failed",
          });
          return res.status(400).json({ error: "Stake transaction failed" });
        }
      } catch (e: any) {
        await TxModel.create({
          action: "stake",
          amount,
          chainId,
          userId,
          date: new Date(new Date().toUTCString()).getTime(),
          status: "Failed",
        });
        return handleError(e, res);
      }
    } else {
      return res.status(500).json({ error: "Wallet doesn't exist" });
    }
  } catch (error: any) {
    console.error(error);
    res
      .status(400)
      .json({ error: error.reason || "Error creating stake transaction." });
  }
});

// @route    POST api/contract/unstake *
// @desc     unstake
// @access   Private
ContractRouter.post(
  "/unstake",
  authMiddleware,
  async (req: AuthRequest, res) => {
    console.log("Unstake");
    try {
      const { cnt, chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const user = await User.findById(userId);
        let referrer;
        if (user?.referrerId) referrer = await User.findById(user.referrerId);
        const walletDetail = getAccountDetails(mnemonic);
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);
        let referrerAddress = ZeroAddress;
        if (referrer && referrer.mnemonic) {
          referrerAddress = getAccountDetails(
            referrer.mnemonic
          ).eth_wallet_address;
        }

        try {
          const gasPrice = await web3.eth.getGasPrice();
          console.log(`gasPrice ${gasPrice}`);

          const txData = contract.methods
            .unstake(
              // @ts-ignore
              cnt
            )
            .encodeABI();
          const txObj = {
            from: walletDetail.eth_wallet_address,
            to: contract.options.address,
            data: txData,
          };

          const gas = await web3.eth.estimateGas(txObj);
          console.log(`gas ${gas}`);

          const sTx = await web3.eth.accounts.signTransaction(
            { ...txObj, gas, gasPrice },
            walletDetail.eth_wallet_privateKey
          );

          const rept = await web3.eth.sendSignedTransaction(sTx.rawTransaction);

          const eventId = web3.eth.abi.encodeEventSignature(USERUNSTAKED_EVENT);
          const logs = rept.logs.filter(
            (log: any) => log.topics[0] === eventId
          );
          const results = logs.map((log: any) =>
            web3.eth.abi.decodeLog(
              USERUNSTAKED_EVENT.inputs,
              log.data.toString(),
              log.topics.map((t: any) => t.toString())
            )
          );
          console.log("unstake", rept.logs);
          console.log(
            `Unstake transaction ${rept.transactionHash} is occurred`
          );

          if (rept.status.toString() === "1") {
            console.log(`Unstake successfully`);
            const tx = await TxModel.create({
              action: "unstake",
              chainId,
              userId,
              hash: rept.transactionHash,
              status: "Complete",
              amount: String(results[0][2]),
              date: new Date(new Date().toUTCString()).getTime(),
            });
            await StakingModel.findOneAndUpdate(
              { userId, chainId, count: cnt },
              { unstaken: false }
            );
            return res.json({ tx: tx });
          } else {
            console.log(`UnStake failed`);

            await TxModel.create({
              hash: rept.transactionHash,
              action: "unstake",
              amount: String(results[0][2]),
              chainId,
              userId,
              count: cnt,
              status: "Failed",
              date: new Date(new Date().toUTCString()).getTime(),
            });
            return res.status(400).json({ err: "UnStake transaction failed" });
          }
        } catch (e: any) {
          await TxModel.create({
            action: "unstake",
            chainId,
            userId,
            count: cnt,
            status: "Failed",
            date: new Date(new Date().toUTCString()).getTime(),
          });
          return handleError(e, res);
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// @route    POST api/contract/claim *
// @desc     claim rewards
// @access   Private
ContractRouter.post("/claim", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { cnt, chainId } = req.body;
    const { id: userId } = req.user;
    const { exist, mnemonic } = await getUserWallet(userId);
    if (exist) {
      console.log("----->chainid", chainId);
      const user = await User.findById(userId);
      let referrer;
      if (user?.referrerId) referrer = await User.findById(user.referrerId);
      const walletDetail = getAccountDetails(mnemonic);
      const infuraUrl = infura(chainId);
      const web3 = new Web3(infuraUrl);
      const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);
      let referrerAddress = ZeroAddress;
      if (referrer && referrer.mnemonic) {
        referrerAddress = getAccountDetails(
          referrer.mnemonic
        ).eth_wallet_address;
      }

      try {
        const gasPrice = await web3.eth.getGasPrice();
        console.log(`gasPrice ${gasPrice}`);

        const txData = contract.methods
          .claim(
            // @ts-ignore
            cnt
          )
          .encodeABI();
        const txObj = {
          from: walletDetail.eth_wallet_address,
          to: contract.options.address,
          data: txData,
        };

        const gas = await web3.eth.estimateGas(txObj);
        console.log(`gas ${gas}`);

        const sTx = await web3.eth.accounts.signTransaction(
          { ...txObj, gas, gasPrice },
          walletDetail.eth_wallet_privateKey
        );

        const rept = await web3.eth.sendSignedTransaction(sTx.rawTransaction);

        console.log(`Claim transaction ${rept.transactionHash} is occurred`);

        const eventId = web3.eth.abi.encodeEventSignature(USERCLAIMED_EVENT);
        const logs = rept.logs.filter((log: any) => log.topics[0] === eventId);
        const results = logs.map((log: any) =>
          web3.eth.abi.decodeLog(
            USERCLAIMED_EVENT.inputs,
            log.data.toString(),
            log.topics.map((t: any) => t.toString())
          )
        );
        console.log("claim", results);
        console.log(`transaction ${rept.transactionHash} is occurred`);

        if (rept.status.toString() === "1") {
          await TxModel.create({
            action: "claim",
            userId,
            chainId,
            count: cnt,
            amount: String(results[0][2]),
            hash: rept.transactionHash,
            status: "Complete",
            date: new Date(new Date().toUTCString()).getTime(),
          });
          console.log(`Claim successfully`);
          const originaldata = await StakingModel.findOne({
            chainId,
            userId,
            count: cnt,
          });
          // const newval = Number(originaldata?.amount) - Number(results[0][2])
          const tx = await StakingModel.findOneAndUpdate(
            {
              chainId,
              userId,
              count: cnt,
            },
            { reward: "0", claimTime: Number(results[0][3]) },
            { new: true }
          );

          // for test
          let now = new Date(new Date().toUTCString()).getTime() / 1000;
          let begin =
            new Date(new Date(tx?.date! * 1000).toUTCString()).getTime() / 1000;
          let claim =
            new Date(new Date(tx?.claimTime! * 1000).toUTCString()).getTime() /
            1000;

          let unstakable =
            new Date(new Date(tx?.date! * 1000).toUTCString()).getTime() /
            1000 +
            tx?.duration! -
            new Date(new Date().toUTCString()).getTime() / 1000;
          let claimable =
            now - begin < 0 || now - claim < 0
              ? false
              : Math.floor((now - begin) / UNIT) !==
              Math.floor((claim - begin) / UNIT);
          let nextClaim = claimable
            ? -1
            : now - begin > 0
              ? Math.ceil((now - begin) / UNIT) * UNIT + begin - now
              : Math.ceil((now - begin) / UNIT) * UNIT + begin - now + UNIT;
          return res.json({
            ...tx!.toObject(),
            claimable: claimable,
            nextClaim: nextClaim,
            unstakeTime: unstakable < 0 ? 0 : unstakable,
          });
        } else {
          console.log(`Claim failed`);
          await TxModel.create({
            hash: rept.transactionHash,
            action: "claim",
            amount: String(results[0][2]),
            chainId,
            userId,
            date: new Date(new Date().toUTCString()).getTime(),
            status: "Failed",
          });
          return res.status(400).json({ error: "Claim transaction failed" });
        }
      } catch (e: any) {
        await TxModel.create({
          action: "claim",
          chainId,
          userId,
          date: new Date(new Date().toUTCString()).getTime(),
          status: "Failed",
        });
        return handleError(e, res);
      }
    } else {
      return res.status(400).json({ error: "Wallet doesn't exist" });
    }
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

// @route    POST api/contract/compound *
// @desc     claim rewards
// @access   Private
ContractRouter.post(
  "/compound",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { cnt, chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const user = await User.findById(userId);
        let referrer;
        if (user?.referrerId) referrer = await User.findById(user.referrerId);
        const walletDetail = getAccountDetails(mnemonic);
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);
        let referrerAddress = ZeroAddress;
        if (referrer && referrer.mnemonic) {
          referrerAddress = getAccountDetails(
            referrer.mnemonic
          ).eth_wallet_address;
        }

        try {
          const gasPrice = await web3.eth.getGasPrice();
          console.log(`gasPrice ${gasPrice}`);

          const txData = contract.methods
            .compound(
              // @ts-ignore
              cnt
            )
            .encodeABI();
          const txObj = {
            from: walletDetail.eth_wallet_address,
            to: contract.options.address,
            data: txData,
          };

          const gas = await web3.eth.estimateGas(txObj);
          console.log(`gas ${gas}`);

          const sTx = await web3.eth.accounts.signTransaction(
            { ...txObj, gas, gasPrice },
            walletDetail.eth_wallet_privateKey
          );

          const rept = await web3.eth.sendSignedTransaction(sTx.rawTransaction);

          console.log(`transaction ${rept.transactionHash} is occurred`);

          const eventId =
            web3.eth.abi.encodeEventSignature(USER_COMPOUND_EVENT);
          const logs = rept.logs.filter(
            (log: any) => log.topics[0] === eventId
          );
          const results = logs.map((log: any) =>
            web3.eth.abi.decodeLog(
              USER_COMPOUND_EVENT.inputs,
              log.data.toString(),
              log.topics.map((t: any) => t.toString())
            )
          );
          console.log("compound", results);
          console.log(`transaction ${rept.transactionHash} is occurred`);

          if (rept.status.toString() === "1") {
            console.log(`compound successfully`);
            await TxModel.create({
              action: "compound",
              userId,
              chainId,
              amount: String(results[0][2]),
              date: new Date(new Date().toUTCString()).getTime(),
              hash: rept.transactionHash,
              status: "Complete",
            });
            const compoundresult = await StakingModel.findOneAndUpdate(
              { userId, chainId, count: cnt },
              {
                reward: 0,
                date: Number(results[0][3]),
                claimTime: Number(results[0][3]),
                amount: String(results[0][4]),
              },
              { new: true }
            );

            let now = new Date(new Date().toUTCString()).getTime() / 1000;
            let begin =
              new Date(
                new Date(compoundresult?.date! * 1000).toUTCString()
              ).getTime() / 1000;
            let claim =
              new Date(
                new Date(compoundresult?.claimTime! * 1000).toUTCString()
              ).getTime() / 1000;

            let unstakable =
              new Date(
                new Date(compoundresult?.date! * 1000).toUTCString()
              ).getTime() /
              1000 +
              compoundresult?.duration! -
              new Date(new Date().toUTCString()).getTime() / 1000;
            let claimable =
              now - begin < 0 || now - claim < 0
                ? false
                : Math.floor((now - begin) / UNIT) !==
                Math.floor((claim - begin) / UNIT);
            let nextClaim = claimable
              ? -1
              : now - begin > 0
                ? Math.ceil((now - begin) / UNIT) * UNIT + begin - now
                : Math.ceil((now - begin) / UNIT) * UNIT + begin - now + UNIT;

            console.log("result", results);
            return res.json({
              ...compoundresult?.toObject(),
              claimable: claimable,
              nextClaim: nextClaim,
              unstakeTime: unstakable < 0 ? 0 : unstakable,
            });
          } else {
            console.log(`Compound failed`);
            await TxModel.create({
              action: "compound",
              userId,
              chainId,
              amount: String(results[0][2]),
              date: new Date(new Date().toUTCString()).getTime(),
              hash: rept.transactionHash,
              status: "Failed",
            });
            return res.status(400).json({ err: "Compound transaction failed" });
          }
        } catch (e: any) {
          await TxModel.create({
            action: "compound",
            userId,
            chainId,
            date: new Date(new Date().toUTCString()).getTime(),
            status: "Failed",
          });
          return handleError(e, res);
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// @route    POST api/contract/getreferralbonus
// @desc     claim referral bonus
// @access   Private
ContractRouter.post(
  "/getreferralbonus",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const user = await User.findById(userId);
        const walletDetail = getAccountDetails(mnemonic);
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

        try {
          const gasPrice = await web3.eth.getGasPrice();
          console.log(`gasPrice ${gasPrice}`);

          const txData = contract.methods.getReferralBonus().encodeABI();
          const txObj = {
            from: walletDetail.eth_wallet_address,
            to: contract.options.address,
            data: txData,
          };

          const gas = await web3.eth.estimateGas(txObj);
          console.log(`gas ${gas}`);

          const sTx = await web3.eth.accounts.signTransaction(
            { ...txObj, gas, gasPrice },
            walletDetail.eth_wallet_privateKey
          );

          const rept = await web3.eth.sendSignedTransaction(sTx.rawTransaction);

          console.log(`transaction ${rept.transactionHash} is occurred`);

          const eventId =
            web3.eth.abi.encodeEventSignature(REFERRAL_BONUS_EVENT);
          const logs = rept.logs.filter(
            (log: any) => log.topics[0] === eventId
          );
          const results = logs.map((log: any) =>
            web3.eth.abi.decodeLog(
              REFERRAL_BONUS_EVENT.inputs,
              log.data.toString(),
              log.topics.map((t: any) => t.toString())
            )
          );
          console.log("getreferralbonus", results);
          console.log(`transaction ${rept.transactionHash} is occurred`);

          if (rept.status.toString() === "1") {
            console.log(`Get referral bonus successfully`);
            const tx = await TxModel.create({
              hash: rept.transactionHash,
              action: "referralbonus",
              amount: String(results[0][1]),
              date: new Date(new Date().toUTCString()).getTime(),
              chainId,
              status: "Complete",
              userId,
            });
            return res.json({ tx: tx });
          } else {
            console.log(`Get referral bonus failed`);
            res
              .status(400)
              .json({ error: "Get referral bonus transaction failed" });
          }
        } catch (e: any) {
          return handleError(e, res);
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return res.status(400).json({ error: error.message });
    }
  }
);

// @route    POST api/contract/getreferralreward
// @desc     get referral reward
// @access   Private
ContractRouter.post(
  "/getreferralward",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const user = await User.findById(userId);
        let referrer;
        if (user?.referrerId) referrer = await User.findById(user.referrerId);
        const walletDetail = getAccountDetails(mnemonic);
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);
        let referrerAddress = ZeroAddress;
        if (referrer && referrer.mnemonic) {
          referrerAddress = getAccountDetails(
            referrer.mnemonic
          ).eth_wallet_address;
        }

        try {
          const gasPrice = await web3.eth.getGasPrice();
          console.log(`gasPrice ${gasPrice}`);

          const txData = contract.methods.getReferralReward().encodeABI();
          const txObj = {
            from: walletDetail.eth_wallet_address,
            to: contract.options.address,
            data: txData,
          };

          const gas = await web3.eth.estimateGas(txObj);
          console.log(`gas ${gas}`);

          const sTx = await web3.eth.accounts.signTransaction(
            { ...txObj, gas, gasPrice },
            walletDetail.eth_wallet_privateKey
          );

          const rept = await web3.eth.sendSignedTransaction(sTx.rawTransaction);

          console.log(`transaction ${rept.transactionHash} is occurred`);

          const eventId = web3.eth.abi.encodeEventSignature(REFERRAL_EVENT);
          const logs = rept.logs.filter(
            (log: any) => log.topics[0] === eventId
          );
          const results = logs.map((log: any) =>
            web3.eth.abi.decodeLog(
              REFERRAL_EVENT.inputs,
              log.data.toString(),
              log.topics.map((t: any) => t.toString())
            )
          );
          console.log("getreferral", results);
          console.log(`transaction ${rept.transactionHash} is occurred`);

          if (rept.status.toString() === "1") {
            console.log(`Get referral reward successfully`);
            const tx = TxModel.create({
              hash: rept.transactionHash,
              action: "referralreward",
              amount: results[0][1],
              chainId,
              userId,
              date: new Date(new Date().toUTCString()).getTime(),
              status: "Complete",
            });
            return res.json({ tx });
          } else {
            const tx = TxModel.create({
              hash: rept.transactionHash,
              action: "referralreward",
              amount: results[0][1],
              chainId,
              userId,
              date: new Date(new Date().toUTCString()).getTime(),
              status: "Fail",
            });
            console.log(`Get referral reward failed`);
            res
              .status(400)
              .json({ err: "Get referral reward transaction failed" });
          }
        } catch (e: any) {
          return handleError(e, res);
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return res.status(400).json({ error: error.message });
    }
  }
);

// @route    POST api/contract/balance
// @desc     balance
// @access   Private
ContractRouter.post(
  "/balance",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const balance = await getTokenBalance(mnemonic);
        return res.json({ balance });
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return handleError(error, res);
    }
  }
);

// @route    POST api/contract/claimableamount
// @desc     claimableamount
// @access   Private
ContractRouter.post(
  "/claimableamount",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      console.log("claimableamount");
      const { cnt, chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        // const user = await User.findById(userId);
        // let referrer;
        // if (user?.referrerId) referrer = await User.findById(user.referrerId);
        const walletDetail = getAccountDetails(mnemonic);
        console.log(walletDetail.eth_wallet_privateKey);
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

        try {
          const txData: bigint = await contract.methods
            .claimableAmount(
              // @ts-ignore
              cnt
            )
            .call({ from: walletDetail.eth_wallet_address });

          console.log("txData", txData.toString());

          return res.json({ amount: txData.toString() });
        } catch (e) {
          console.error(e);
          return handleError(e, res);
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return handleError(error, res);
    }
  }
);

// @route    POST api/contract/getusertotal !*
// @desc     get reward information for every user in four chains in staking page
// @access   Private
ContractRouter.post(
  "/getusertotal",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      const returnValue: any[] = [];
      if (exist) {
        for (let chainId = 0; chainId < 4; chainId++) {
          const walletDetail = getAccountDetails(mnemonic);
          if (chainId == 3) {
            returnValue.push({
              stakeCount: "0",
              totalStake: "0",
              totalClaim: "0",
              totalUnstake: "0",
              level: "0",
              lastUpdate: "0",
              rewardPercentage: "0",
              benefits: "0",
              referrer: "0",
              unit: "0",
            });
            break;
          }
          const infuraUrl = infura(chainId);
          const web3 = new Web3(infuraUrl);
          const contract = new web3.eth.Contract(
            APEX_ABI,
            APEX_ADDRESS[chainId]
          );

          try {
            const result = await contract.methods
              .getUserTotal(
                // @ts-ignore
                walletDetail.eth_wallet_address
              )
              .call();

            if (result) {
              returnValue.push({
                stakeCount: String(result[0]),
                totalStake: String(result[1]),
                totalClaim: String(result[2]),
                totalUnstake: String(result[3]),
                level: String(result[4]),
                lastUpdate: String(result[5]),
                rewardPercentage: String(result[6]),
                benefits: String(result[7]),
                referrer: String(result[8]),
                unit: String(result[9]),
              });
            }
          } catch (e) {
            console.error(e);
            return handleError(e, res);
          }
        }
        return res.json(returnValue);
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return handleError(error, res);
    }
  }
);

// @route    POST api/contract/getapyforuser *
// @desc     get apy information for every user in one chains in staking page
// @access   Private
ContractRouter.post(
  "/getapyforuser",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      console.log("rewardtracker");
      const { chainId } = req.body.chainId;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const walletDetail = getAccountDetails(mnemonic);
        console.log(walletDetail.eth_wallet_privateKey);
        const infuraUrl = infura(chainId + 1);
        const web3 = new Web3(infuraUrl);
        console.log(
          "APEX_ADDRESS[chainId + 1]",
          infuraUrl,
          APEX_ADDRESS[chainId + 1]
        );
        const contract = new web3.eth.Contract(
          APEX_ABI,
          APEX_ADDRESS[chainId + 1]
        );

        try {
          const result = await contract.methods
            .getUserTotal(
              // @ts-ignore
              walletDetail.eth_wallet_address
            )
            .call();
          if (result) {
            const data = {
              stake: String(result[1]),
              claim: String(result[2]),
              unstake: String(result[3]),
            };
            console.log(data);
            return res.json(data);
          }
        } catch (e) {
          console.error(e);
          return res.json({ e });
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return res.status(400).json({ error: error.message });
    }
  }
);

// @route    POST api/contract/getuserstake
// @desc     get uesr stake information
// @access   Private
ContractRouter.post(
  "/getuserstake",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      console.log("getuserstake");
      const { chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const walletDetail = getAccountDetails(mnemonic);
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

        try {
          const txData = await contract.methods
            .getUserStakeInfo()
            .call({ from: walletDetail.eth_wallet_address });

          console.log("txData", txData);
          return res.json({ txData: JSON.stringify(txData) });
        } catch (e) {
          console.error(e);
          return res.json({ error: e });
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return res.status(400).json({ error: error.message });
    }
  }
);

// @route    POST api/contract/getRefereesList
// @desc     get uesr referees list
// @access   Private
ContractRouter.post(
  "/getRefereesList",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      console.log("getRefereesList");
      const { chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        // const user = await User.findById(userId);
        // let referrer;
        // if (user?.referrerId) referrer = await User.findById(user.referrerId);
        const walletDetail = getAccountDetails(mnemonic);
        console.log(walletDetail.eth_wallet_privateKey);
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

        try {
          const txData = await contract.methods
            .getRefereesList()
            .call({ from: walletDetail.eth_wallet_address });

          console.log("txData", txData);
          return res.json({ txData: txData });
        } catch (e) {
          console.error(e);
          return handleError(e, res);
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return handleError(error, res);
    }
  }
);

// @route    POST api/contract/referrer
// @desc     get referrer information
// @access   Private
ContractRouter.post(
  "/referrer",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      console.log("referrer");
      const { chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        // const user = await User.findById(userId);
        // let referrer;
        // if (user?.referrerId) referrer = await User.findById(user.referrerId);
        const walletDetail = getAccountDetails(mnemonic);
        console.log(walletDetail.eth_wallet_privateKey);
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

        try {
          const txData = await contract.methods
            .isRefered()
            .call({ from: walletDetail.eth_wallet_address });

          console.log("txData", txData);
          return res.json({ txData: txData });
        } catch (e) {
          console.error(e);
          return handleError(e, res);
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return handleError(error, res);
    }
  }
);

// @route    POST api/contract/referralInfo *
// @desc     get referral information : referral page info
// @access   Private
ContractRouter.post(
  "/referralinfo",
  authMiddleware,
  async (req: AuthRequest, res) => {
    console.log("referralinfo");
    try {
      const { chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const walletDetail = getAccountDetails(mnemonic);
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

        try {
          const result = await contract.methods
            // @ts-ignore
            .getReferralInfo(walletDetail.eth_wallet_address)
            .call();

          if (result) {
            const refCount = (await UserModel.find({ referrerId: userId }))
              .length;
            const data = {
              referralCount: refCount,
              referralAmount: String(result[1]),
              referralReward: String(result[2]),
              referralReceived: String(result[3]),
              bonusReward: String(result[4]),
              bonusReceived: String(result[5]),
              referralLevel: String(result[6]),
              lastUpdate: String(result[7]),
            };

            const updateQuery: any = {};
            updateQuery[`referLevel.${CHAIN_LIST[chainId]}`] = Number(result[6]);

            const leveldata = await LevelModel.findOneAndUpdate({
              userId: userId,
            }, { $set: updateQuery });
            if (leveldata) {
              const prevLevel: number =
                // @ts-ignore
                leveldata.referLevel[CHAIN_LIST[chainId]];
              if (
                // @ts-ignore
                prevLevel < Number(result[6])
              ) {
                await NotificationModel.create({
                  userId,
                  title: "Referral level upgraded",
                  content: `Your level has increased from ${
                    // @ts-ignore
                    prevLevel
                    } to ${Number(result[6])} on ${CHAIN_LIST[chainId]}`,
                });
              } else if (prevLevel > Number(result[6])) {
                await NotificationModel.create({
                  userId,
                  title: "Referral level downgraded",
                  content: `Your level has decreased from ${prevLevel} to ${Number(
                    result[6]
                  )} on ${CHAIN_LIST[chainId]}`,
                });
              }
              return res.json(data);
            } else {
              res.status(427).json({ error: "User not found" });
            }
          }
        } catch (e) {
          console.error(e);
          return handleError(e, res)
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// @route    POST api/contract/notify *
// @desc     get notify information
// @access   Private
ContractRouter.post(
  "/getNotification",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      console.log("notification");
      const { chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        // const user = await User.findById(userId);
        // let referrer;
        // if (user?.referrerId) referrer = await User.findById(user.referrerId);
        const walletDetail = getAccountDetails(mnemonic);
        console.log(walletDetail.eth_wallet_privateKey);
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

        try {
          const result = await contract.methods
            .getReferralInfo()
            .call({ from: walletDetail.eth_wallet_address });
          if (result) {
            const refCount = (await UserModel.find({ referrerId: userId }))
              .length;
            const data = {
              referralCount: refCount,
              referralAmount: String(result[1]),
              referralReward: String(result[2]),
              bonusReward: String(result[3]),
              bonusReceived: String(result[4]),
              referralLevel: String(result[5]),
              lastUpdate: String(result[6]),
            };
            console.log("data", data);
            return res.json({
              referralCount: String(refCount),
              referralAmount: String(result[1]),
              referralReward: String(result[2]),
              bonusReward: String(result[3]),
              bonusReceived: String(result[4]),
              referralLevel: String(result[5]),
              lastUpdate: String(result[6]),
            });
          }
        } catch (e) {
          console.error(e);
          return handleError(e, res)
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return handleError(error, res)
    }
  }
);

// @route    POST api/contract/fetchtx
// @desc     get fetch tx information
// @access   Private
ContractRouter.post(
  "/fetchtx",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { chainId, type, count } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      let result;
      if (type === "Dashboard") {
        const { from, to } = req.body;

        result = await TradingModel.find({
          date: {
            $gt: from,
            $lt: to,
          },
        });
        console.log("fetchtx -> Dashboard", result.length);
        return res.json(result);
      } else if (exist) {
        switch (type) {
          case "Wallet":
            result = await TxModel.find({ userId });
            return res.json(result.reverse());
          case "Staking":
            result = await StakingModel.find({
              userId,
              unstaken: true,
            });
            const returnValue: any = [];

            result.map((item, index) => {
              // for test
              let now = new Date(new Date().toUTCString()).getTime() / 1000;
              let begin =
                new Date(new Date(item.date! * 1000).toUTCString()).getTime() /
                1000;
              let claim =
                new Date(
                  new Date(item.claimTime! * 1000).toUTCString()
                ).getTime() / 1000;

              let unstakable =
                new Date(new Date(item.date! * 1000).toUTCString()).getTime() /
                1000 +
                item?.duration -
                new Date(new Date().toUTCString()).getTime() / 1000;
              let claimable =
                now - begin < 0 || now - claim < 0
                  ? false
                  : Math.floor((now - begin) / UNIT) !==
                  Math.floor((claim - begin) / UNIT);
              let nextClaim = claimable
                ? -1
                : now - begin > 0
                  ? Math.ceil((now - begin) / UNIT) * UNIT + begin - now
                  : Math.ceil((now - begin + UNIT) / UNIT) * UNIT + begin - now;

              console.log(
                "--->",
                nextClaim,
                claimable,
                new Date(new Date().toUTCString()).getTime() / 1000 -
                new Date(
                  new Date(item.date! * 1000).toUTCString()
                ).getTime() /
                1000
              );
              returnValue.push({
                ...item.toObject(),
                // for test
                claimable: claimable,
                nextClaim: nextClaim,
                unstakeTime: unstakable < 0 ? 0 : unstakable,
              });
            });

            return res.json(returnValue);

          case "Sync":
            try {
              const infuraUrl = infura(chainId);
              const web3 = new Web3(infuraUrl);
              const contract = new web3.eth.Contract(
                APEX_ABI,
                APEX_ADDRESS[chainId]
              );
              const address =
                chainId < 3
                  ? getAccountDetails(mnemonic).eth_wallet_address
                  : getAccountDetails(mnemonic).tron_wallet_address;

              const syncdata: [] = await contract.methods
                // @ts-ignore
                .calcBenefit(address)
                .call();
              const tx = await StakingModel.findOneAndUpdate(
                { chainId, userId, count },
                { reward: syncdata[count] },
                { new: true }
              );
              let now = new Date(new Date().toUTCString()).getTime() / 1000;
              let begin =
                new Date(new Date(tx?.date! * 1000).toUTCString()).getTime() /
                1000;
              let claim =
                new Date(
                  new Date(tx?.claimTime! * 1000).toUTCString()
                ).getTime() / 1000;

              console.log("------->", now, begin, claim);
              let unstakable =
                new Date(new Date(tx?.date! * 1000).toUTCString()).getTime() /
                1000 +
                tx?.duration! -
                new Date(new Date().toUTCString()).getTime() / 1000;
              let claimable =
                now - begin < 0 || now - claim < 0
                  ? false
                  : Math.floor((now - begin) / UNIT) !==
                  Math.floor((claim - begin) / UNIT);
              let nextClaim = claimable
                ? -1
                : now - begin > 0
                  ? Math.ceil((now - begin) / UNIT) * UNIT + begin - now
                  : Math.ceil((now - begin) / UNIT) * UNIT + begin - now + UNIT;

              console.log(
                "--->",
                nextClaim,
                claimable,
                new Date(new Date().toUTCString()).getTime() / 1000 -
                new Date(new Date(tx?.date! * 1000).toUTCString()).getTime() /
                1000
              );
              return res.json({
                ...tx!.toObject(),
                // for test
                claimable: claimable,
                nextClaim: nextClaim,
                unstakeTime: unstakable < 0 ? 0 : unstakable,
              });
            } catch (err: any) {
              console.log(err);
              return res.status(400).json({ error: err });
            }
          default:
            console.log("No type");
            return res.json({ error: { msg: "Invalid type" } });
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return handleError(error, res)
    }
  }
);

// @route    POST api/contract/viewpool *
// @desc     get pool information : dashboard
// @access   Private
ContractRouter.post("/viewpool", authMiddleware, async (req: AuthRequest, res) => {
  try {
    console.log("viewpool");
    const { id: userId } = req.user;
    const data = await totalpoolinfo(userId);
    // const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[0]);
    // const result = await contract.methods.getPoolInfo().call();
    console.log("viewpool");
    return res.json(data);
  } catch (error: any) {
    console.error(error);
    return res.status(400).json({ error: error.message });
  }
});

// *
export const eachpoolinfo = async (chainId: number, userId: string) => {
  if (chainId < 3) {
    const infuraUrl = infura(chainId);
    const web3 = new Web3(infuraUrl);
    const { exist, mnemonic } = await getUserWallet(userId);
    const wallet = getAccountDetails(mnemonic)
    try {
      const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);
      const result: any[] = await contract.methods.getPoolInfo().call();
      // @ts-ignore
      const user: any[] = await contract.methods.getUserTotal(wallet.eth_wallet_address).call()

      if (result && user) {
        console.log(chainId);
        return {
          poolTotalStake: String(result[2]),
          poolBenefit: String(result[5]),
          level: Number(user[4])
        };
      } else {
        return {
          poolTotalStake: "0",
          poolBenefit: "0",
          level: 0
        };
      }
    } catch (error) {
      throw error;
    }
  } else {
    console.log(chainId);
    return {
      poolTotalStake: "0",
      poolBenefit: "0",
      level: 0
    }
  }
};

// *
const totalpoolinfo = async (userId: string) => {
  let stake = ["0", "0", "0", "0"];
  let rewards = ["0", "0", "0", "0"];
  let levels = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const {
      poolTotalStake,
      poolBenefit,
      level,
    } = await eachpoolinfo(i, userId);
    stake[i] = String(poolTotalStake);
    rewards[i] = String(poolBenefit);
    levels[i] = Number(level)
  }
  return {
    totalStake: String(stake),
    totalRewards: String(rewards),
    level: levels
  };
};

// @route    POST api/contract/createvote *
// @desc     create vote
// @access   Private
ContractRouter.post(
  "/createvote",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { chainId, level, duration, title, content, type } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        if (chainId == 3) return
        const user = await User.findById(userId);
        const walletDetail = getAccountDetails(mnemonic);
        // chainid
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

        try {
          const gasPrice = await web3.eth.getGasPrice();
          console.log(`gasPrice ${gasPrice}`);
          // chainid
          const approveTxData = contract.methods
            .createVote(
              // @ts-ignore
              level,
              duration
            )
            .encodeABI();
          const approveTxObj = {
            from: walletDetail.eth_wallet_address,
            to: contract.options.address,
            data: approveTxData,
          };
          const approveGas = await web3.eth.estimateGas(approveTxObj);
          console.log(`approve: approveGas ${approveGas}`);

          const approveTx = await web3.eth.accounts.signTransaction(
            { ...approveTxObj, gas: approveGas, gasPrice },
            walletDetail.eth_wallet_privateKey
          );

          const rept = await web3.eth.sendSignedTransaction(
            approveTx.rawTransaction
          );

          console.log(`transaction ${rept.transactionHash} is occurred`);

          const eventId = web3.eth.abi.encodeEventSignature(VOTE_CREATED_EVENT);
          const logs = rept.logs.filter(
            (log: any) => log.topics[0] === eventId
          );
          const results = logs.map((log: any) =>
            web3.eth.abi.decodeLog(
              VOTE_CREATED_EVENT.inputs,
              log.data.toString(),
              log.topics.map((t: any) => t.toString())
            )
          );
          console.log("results", results);

          if (rept.status.toString() === "1") {
            console.log(`Vote created successfully`);
            const user = await UserModel.findById(userId);
            const totalUser = await UserModel.find({});
            const tx = new VoteModel({
              chainId,
              title: title,
              content: content,
              count: Number(String(results[0][0])),
              level: Number(String(results[0][1])),
              duration: String(results[0][2]),
              startTime: String(
                new Date(
                  new Date(Number(results[0][3]) * 1000).toUTCString()
                ).getTime()
              ),
              user: user!.username,
              yes: [],
              no: [],
              totalUser: totalUser.length,
              type: type,
              userId,
            });
            await tx.save();
            // const result = await TxModel.find({ id: userId, action: "stake", chainId: chainId });
            return res.json({ tx: tx });
          } else {
            console.log(`Vote created failed`);
            return res.status(400).json({ err: "Vote created failed" });
          }
        } catch (e: any) {
          console.error(e);
          return handleError(e, res)
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return handleError(error, res)
    }
  }
);

// @route    POST api/contract/starttime *
// @desc     create vote
// @access   Private
ContractRouter.post(
  "/starttime",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      console.log("startTime");
      const { chainId } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const infuraUrl = infura(0);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

        try {
          const result = await contract.methods.startTime().call();

          return res.json({
            unit: String(result),
          });
        } catch (e) {
          console.error(e);
          return handleError(e, res)
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return handleError(error, res)
    }
  }
);

// @route    POST api/contract/viewVoteCards *
// @desc     view vote cards
// @access   public
ContractRouter.get("/viewVoteCards", async (req, res) => {
  try {
    const results = await VoteModel.aggregate([
      {
        $addFields: {
          userIdObj: {
            $toObjectId: "$userId",
          },
        },
      },
      {
        $lookup: {
          from: "users", // Name of the UserModel collection
          localField: "userIdObj",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $addFields: {
          username: { $arrayElemAt: ["$user.username", 0] },
        },
      },
      {
        $project: {
          user: 0,
          userIdObj: 0,
          __v: 0,
        },
      },
    ]);

    return res.json(results);
  } catch (e: any) {
    console.error(e);
    res
      .status(400)
      .json({ error: e.reason || "Error reading vote transaction." });
  }
});

// @route    POST api/contract/unit !*
// @desc     get reward information for every user in four chains in staking page
// @access   Private
ContractRouter.post("/unit", authMiddleware, async (req: AuthRequest, res) => {
  try {
    console.log("unit");
    const { chainId } = req.body;
    const { id: userId } = req.user;
    const { exist, mnemonic } = await getUserWallet(userId);
    if (exist) {
      const walletDetail = getAccountDetails(mnemonic);
      console.log(walletDetail.eth_wallet_privateKey);
      const data: string[] = [];
      console.log("chainid", chainId);
      if (chainId == 3) {
        return res.json({ unit: 0 });
      }
      const infuraUrl = infura(chainId);
      const web3 = new Web3(infuraUrl);
      const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

      try {
        const result = await contract.methods.unit().call();

        console.log("result", result);
        return res.json({
          unit: String(result),
        });
      } catch (e) {
        console.error(e);
        return res.status(400).json({ e });
      }
    } else {
      return res.status(400).json({ error: "Wallet doesn't exist" });
    }
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

// @route    POST api/contract/totalbenefit !*
// @desc     get reward information for every user in four chains in staking page
// @access   Private
ContractRouter.post(
  "/totalbenefit",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      console.log("totalbenefit");
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const walletDetail = getAccountDetails(mnemonic);
        console.log(walletDetail.eth_wallet_privateKey);
        let data: [string] = [""];
        let level: [string] = [""];
        for (let chainId = 0; chainId < 4; chainId++) {
          if (chainId == 3) {
            data[chainId as number] = "0";
            level[chainId as number] = "0";
            break;
          }
          const infuraUrl = infura(chainId);
          const web3 = new Web3(infuraUrl);
          const contract = new web3.eth.Contract(
            APEX_ABI,
            APEX_ADDRESS[chainId]
          );

          try {
            const result = await contract.methods
              .rewardTracker(
                // @ts-ignore
                walletDetail.eth_wallet_address
              )
              .call();

            const result2 = await contract.methods
              .getUserTotal(
                // @ts-ignore
                walletDetail.eth_wallet_address
              )
              .call();

            console.log(`------------->${result}`);

            if (result) {
              data[chainId] = String(Number(result) ? Number(result) : "0");
            }
            if (result2) {
              level[chainId] = String(result2[4]);
            }
          } catch (e) {
            console.error(e);
            return res.status(400).json({ error: e });
          }
        }
        return res.json({
          totalbenefit: data,
          level: level,
        });
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// @route    POST api/contract/vote *
// @desc     vote cards
// @access   Private
ContractRouter.post("/vote", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { chainId, number, choice } = req.body;
    const { id: userId } = req.user;
    console.log("vote", userId, chainId, number, choice);
    const { exist, mnemonic } = await getUserWallet(userId);
    if (exist) {
      const user = await User.findById(userId);
      const walletDetail = getAccountDetails(mnemonic);
      // chainid
      const infuraUrl = infura(chainId);
      const web3 = new Web3(infuraUrl);
      const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

      try {
        const gasPrice = await web3.eth.getGasPrice();
        console.log(`gasPrice ${gasPrice}`);
        // chainid
        const approveTxData = contract.methods
          .participateVote(
            // @ts-ignore
            number,
            choice
          )
          .encodeABI();
        const approveTxObj = {
          from: walletDetail.eth_wallet_address,
          to: contract.options.address,
          data: approveTxData,
        };
        const approveGas = await web3.eth.estimateGas(approveTxObj);
        console.log(`approve: approveGas ${approveGas}`);

        const approveTx = await web3.eth.accounts.signTransaction(
          { ...approveTxObj, gas: approveGas, gasPrice },
          walletDetail.eth_wallet_privateKey
        );

        const rept = await web3.eth.sendSignedTransaction(
          approveTx.rawTransaction
        );

        console.log(`transaction ${rept.transactionHash} is occurred`);

        console.log(`Vote created successfully`);
        let tx: any;
        if (choice)
          tx = await VoteModel.findOneAndUpdate(
            { count: number },
            { $addToSet: { yes: String(userId) } },
            { new: true }
          );
        else
          tx = await VoteModel.findOneAndUpdate(
            { count: number },
            { $addToSet: { no: String(userId) } },
            { new: true }
          );
        console.log("tx", tx);
        return res.json({ tx });
      } catch (e: any) {
        e.reason = "Vote action failed"
        console.error(e);
        return handleError(e, res)
      }
    } else {
      return res.status(500).json({ error: "Wallet doesn't exist" });
    }
  } catch (error: any) {
    console.error(error);
    error.reason = "Creating vote action failed"
    return handleError(error, res)
  }
});

// @route    POST api/contract/votedelete *
// @desc     delete vote card
// @access   Private
ContractRouter.post(
  "/votedelete",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { chainId, count } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const user = await User.findById(userId);
        const tx = await VoteModel.findOne({ count: count });
        if (tx!.yes.length > 0 || tx!.no.length > 0)
          return res.status(400).json({ error: "Vote is already started" });
        const walletDetail = getAccountDetails(mnemonic);
        // chainid
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);

        try {
          const gasPrice = await web3.eth.getGasPrice();
          console.log(`gasPrice ${gasPrice}`);
          // chainid
          const approveTxData = contract.methods
            .cancelVote(
              // @ts-ignore
              number
            )
            .encodeABI();
          const approveTxObj = {
            from: walletDetail.eth_wallet_address,
            to: contract.options.address,
            data: approveTxData,
          };
          const approveGas = await web3.eth.estimateGas(approveTxObj);
          console.log(`approve: approveGas ${approveGas}`);

          const approveTx = await web3.eth.accounts.signTransaction(
            { ...approveTxObj, gas: approveGas, gasPrice },
            walletDetail.eth_wallet_privateKey
          );

          const rept = await web3.eth.sendSignedTransaction(
            approveTx.rawTransaction
          );

          console.log(`transaction ${rept.transactionHash} is occurred`);

          console.log(`Vote cancelled successfully`);
          const tx = await VoteModel.findOneAndDelete(
            { count: count },
            { new: true }
          );
          console.log("tx", tx);
          return res.json({ tx });
        } catch (e: any) {
          console.error(e);
          res
            .status(400)
            .json({ error: e.reason || "Error cancel vote transaction." });
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      res
        .status(400)
        .json({ error: error.reason || "Error delete vote card." });
    }
  }
);

// @route    POST api/contract/voteupdate *
// @desc     delete vote card
// @access   Private
ContractRouter.post(
  "/voteupdate",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { chainId, count, duration } = req.body;
      const { id: userId } = req.user;
      const { exist, mnemonic } = await getUserWallet(userId);
      if (exist) {
        const infuraUrl = infura(chainId);
        const web3 = new Web3(infuraUrl);
        const contract = new web3.eth.Contract(APEX_ABI, APEX_ADDRESS[chainId]);
        const walletDetail = getAccountDetails(mnemonic);
        // chainid
        try {
          const gasPrice = await web3.eth.getGasPrice();
          console.log(`gasPrice ${gasPrice}`);
          // chainid
          const approveTxData = contract.methods
            .updateVote(
              // @ts-ignore
              number,
              duration
            )
            .encodeABI();
          const approveTxObj = {
            from: walletDetail.eth_wallet_address,
            to: contract.options.address,
            data: approveTxData,
          };
          const approveGas = await web3.eth.estimateGas(approveTxObj);
          console.log(`approve: approveGas ${approveGas}`);

          const approveTx = await web3.eth.accounts.signTransaction(
            { ...approveTxObj, gas: approveGas, gasPrice },
            walletDetail.eth_wallet_privateKey
          );

          const rept = await web3.eth.sendSignedTransaction(
            approveTx.rawTransaction
          );

          console.log(`transaction ${rept.transactionHash} is occurred`);

          console.log(`Vote cancelled successfully`);
          const user = await User.findById(userId);

          const tx = await VoteModel.findOneAndUpdate(
            { chainId, count, user: user?.username },
            { duration },
            { new: true }
          );
          console.log("tx", tx);
          return res.json({ tx });
        } catch (e: any) {
          console.error(e);
          res
            .status(400)
            .json({ err: e.reason || "Error cancel vote transaction." });
        }
      } else {
        return res.status(400).json({ error: "Wallet doesn't exist" });
      }
    } catch (error: any) {
      console.error(error);
      res
        .status(400)
        .json({ error: error.reason || "Error updateing vote transaction." });
    }
  }
);

// @route    POST api/contract/gasfee *
// @desc     calc gasfee
// @access   Private
ContractRouter.post(
  "/gasfee",
  authMiddleware,
  async (req: AuthRequest, res) => {
    console.log("-->gas");
    const { chainId, address, amount } = req.body;
    const { id: userId } = req.user;
    const { exist, mnemonic } = await getUserWallet(userId);
    const walletDetail = getAccountDetails(mnemonic);
    // chainid
    const infuraUrl = infura(chainId);
    const web3 = new Web3(infuraUrl);
    const usdt = new web3.eth.Contract(ERC20_ABI, USDT_ADDRESS[chainId]);

    try {
      const gasPrice = await web3.eth.getGasPrice();
      console.log(`gasPrice ${gasPrice}`);
      // chainid
      const approveTxData = usdt.methods
        .transfer(
          // @ts-ignore
          address,
          amount
        )
        .encodeABI();
      const approveTxObj = {
        from: walletDetail.eth_wallet_address,
        to: usdt.options.address,
        data: approveTxData,
      };
      const approveGas = await web3.eth.estimateGas(approveTxObj);
      console.log(`approve: approveGas ${approveGas}`);
      res.json(String(approveGas));
    } catch (error) {
      console.log(error);
    return handleError(error, res)

    }
  }
);

// @route    POST api/contract/send *
// @desc     send usdt
// @access   Private
ContractRouter.post("/send", authMiddleware, async (req: AuthRequest, res) => {
  console.log("-->gas");
  const { chainId, address, amount } = req.body;
  const { id: userId } = req.user;
  const { exist, mnemonic } = await getUserWallet(userId);
  const walletDetail = getAccountDetails(mnemonic);
  // chainid
  const infuraUrl = infura(chainId);
  const web3 = new Web3(infuraUrl);
  const usdt = new web3.eth.Contract(ERC20_ABI, USDT_ADDRESS[chainId]);

  try {
    const gasPrice = await web3.eth.getGasPrice();
    console.log(`gasPrice ${gasPrice}`);
    // chainid
    const approveTxData = usdt.methods
      .transfer(
        // @ts-ignore
        address,
        amount
      )
      .encodeABI();
    const approveTxObj = {
      from: walletDetail.eth_wallet_address,
      to: usdt.options.address,
      data: approveTxData,
    };
    const approveGas = await web3.eth.estimateGas(approveTxObj);
    console.log(`approve: approveGas ${approveGas}`);

    const approveTx = await web3.eth.accounts.signTransaction(
      { ...approveTxObj, gas: approveGas, gasPrice },
      walletDetail.eth_wallet_privateKey
    );

    const rept = await web3.eth.sendSignedTransaction(approveTx.rawTransaction);

    console.log(`transaction ${rept.transactionHash} is occurred`);

    console.log(`Sent usdt successfully`);
    return res.json({ msg: "success" });
  } catch (error) {
    console.log(error);
    return handleError(error, res)
  }
});

// Export the router for use in other parts of the application
export default ContractRouter;
