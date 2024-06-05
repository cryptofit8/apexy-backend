import Web3 from "web3";
import { APEX_ABI, APEX_ADDRESS, ERC20_ABI, USDT_ADDRESS } from "../../config";
import { getAccountDetails } from "../WalletRoute/wallet";

export const getTokenBalance = async (mnemonic: string) => {
  const walletDetail = getAccountDetails(mnemonic);
  let i: number;
  const balances: string[] = [];
  for (i = 0; i < 4; i++) {
    if (i < 3) {
      const infuraUrl = infura(i);
      const web3 = new Web3(infuraUrl);
      const contract = new web3.eth.Contract(ERC20_ABI, USDT_ADDRESS[i]);
      try {
        const balanceData: bigint = await contract.methods
          .balanceOf(
            // @ts-ignore
            walletDetail.eth_wallet_address
          )
          .call({ from: walletDetail.eth_wallet_address });
        balances.push(balanceData.toString());
      } catch (err) {
        console.log(err);
        balances.push("0");
      }
    } else {
      balances.push("0");
    }
  }
  console.log("balances->", balances);
  return balances;
};
//   case 2:
//     break;
//   case 3:
//     break;
//   case 4:
//     break;
// }

export const rpcUrl = [
  "https://eth-goerli.g.alchemy.com/v2/leAhwa0dd0Wv9US3aos__FlVkLT5AjS4",
  "https://rpc-mumbai.maticvigil.com",
  "https://data-seed-prebsc-1-s1.binance.org:8545",
];

export const infura = (chainId: number) => {
  return rpcUrl[chainId];
};

export const handleError = async (err: any, res: any) => {
  if (String(err).includes("Transaction has been reverted by the EVM")) {
    if (String(err.reason).includes("insufficient funds for gas")) {
      console.log("Insufficient funds for gas");
      return res.status(400).json({ error: "Insufficient funds for gas" });
    } else {
      console.log(err.reason);
      return res.status(400).json({ error: err.reason });
    }
  } else {
    if (err.message) return res.status(400).json({ error: err.message });
    else return res.status(400).json({ error: err});
  }
};
