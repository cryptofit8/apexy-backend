import { ethers } from "ethers";
// <reference types="@types/tronweb" />
// @ts-expect-error
import TronWeb from "tronweb";

export const TRON_NODE = {
  MAIN: {
    fullNode: "https://api.trongrid.io",
    solidityNode: "https://api.trongrid.io",
    eventServer: "https://api.trongrid.io",
  },
  SHASTA: {
    fullNode: "https://api.shasta.trongrid.io",
    solidityNode: "https://api.shasta.trongrid.io",
    eventServer: "https://api.shasta.trongrid.io",
  },
};

export const getAccountDetails = (mnemonic: string) => {
  const mnemonicWallet = ethers.Wallet.fromPhrase(mnemonic);
  const tronWebInstance = new TronWeb(TRON_NODE.SHASTA);
  const tronWallet = tronWebInstance.fromMnemonic(mnemonic);
  return {
    mnemonic: mnemonic,
    eth_wallet_address: mnemonicWallet.address,
    eth_wallet_privateKey: mnemonicWallet.privateKey,
    tron_wallet_address: tronWallet.address,
    tron_wallet_privateKey: tronWallet.privateKey,
  };
};
