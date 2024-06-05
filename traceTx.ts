import NotificationModel from './model/NotificationModel';
import { USDT_ADDRESS, ERC20_ABI } from "./config";
import { Alchemy, Network, AlchemySubscription } from "alchemy-sdk";
import Web3 from "web3";
// @ts-ignore
import SocketModel from './model/SocketModel';

const transferFunctionSignature = {
  "inputs": [
    {
      "internalType": "address",
      "name": "to",
      "type": "address"
    },
    {
      "internalType": "uint256",
      "name": "value",
      "type": "uint256"
    }
  ],
  "name": "transfer",
  "outputs": [
    {
      "internalType": "bool",
      "name": "",
      "type": "bool"
    }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
}

export const watchEthereum = () => {
  try {

    const infuraUrl = "https://eth-goerli.g.alchemy.com/v2/leAhwa0dd0Wv9US3aos__FlVkLT5AjS4"

    const settings = {
      apiKey: "leAhwa0dd0Wv9US3aos__FlVkLT5AjS4",
      network: Network.ETH_GOERLI,
    }

    const ethereum = new Alchemy(settings);

    ethereum.ws.on(
      {
        method: AlchemySubscription.MINED_TRANSACTIONS,
        addresses: [{ to: USDT_ADDRESS[0] }]
      },
      async (res: any) => {
        console.log("res", res);
        const web3 = new Web3(infuraUrl);
        const functionId = web3.eth.abi.encodeFunctionSignature(transferFunctionSignature)
        const inputData = res.transaction.input;
        if (inputData.startsWith(functionId)) {
          const inputs = web3.eth.abi.decodeParameters(transferFunctionSignature.inputs, inputData.split(functionId)[1]);
          // console.log("inputs", inputs)
          const from = res.transaction.from
          const to = inputs.to
          const amount = inputs.value
          if (USDT_ADDRESS[0] != from) {
            const result = await SocketModel.findOne({ evm: to })
            if (result) {
              console.log("saved")
              await NotificationModel.create({ userId: result.userId, title: "Received cryto from others", content: `You have received a payment of ${amount} USDT from ${from} on Ethereum. You can check transaction details in your wallet.` })
            }
          }
        }
      }
    );

  } catch (err) {
    console.log(err)
  }
}

export const watchPolygon = () => {
  try {
    const infuraUrl = "https://polygon-mumbai.g.alchemy.com/v2/leAhwa0dd0Wv9US3aos__FlVkLT5AjS4"
    const settings = {
      apiKey: "leAhwa0dd0Wv9US3aos__FlVkLT5AjS4", // Replace with your Alchemy API Key
      network: Network.MATIC_MUMBAI, // Replace with your network
    };

    const polygon = new Alchemy(settings);

    // Subscription for Alchemy's minedTransactions API
    polygon.ws.on(
      {
        method: AlchemySubscription.MINED_TRANSACTIONS,
        addresses: [{ to: USDT_ADDRESS[1] }]
      },
      async (res: any) => {
        const web3 = new Web3(infuraUrl);
        const functionId = web3.eth.abi.encodeFunctionSignature(transferFunctionSignature)
        const inputData = res.transaction.input;
        console.log("res", res);
        if (inputData.startsWith(functionId)) {
          const inputs = web3.eth.abi.decodeParameters(transferFunctionSignature.inputs, inputData.split(functionId)[1]);
          // console.log("inputs", inputs)
          const from = res.transaction.from
          const to = inputs.to
          const amount = inputs.value
          if (USDT_ADDRESS[1] != from) {
            const result = await SocketModel.findOne({ evm: to })
            if (result) {
              console.log("saved")
              await NotificationModel.create({ userId: result.userId, title: "Received cryto from others", content: `You have received a payment of ${amount} USDT from ${from} on Polygon. You can check transaction details in your wallet.` })
            }
          }
        }
      }
    )
  } catch (err) {
    console.log(err)
  }
}


export const watchBinanace = () => {

}