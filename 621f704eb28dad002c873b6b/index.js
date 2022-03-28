const { ethers } = require("ethers");
import { database, ObjectId } from "@spica-devkit/database";
import axios from "axios";


const CONFIG_BUCKET = process.env.CONFIG_BUCKET_ID;
const AUCTION_BUCKET = process.env.AUCTION_BUCKET_ID;
const USER_BUCKET = process.env.USER_BUCKET_ID;
const MERCHANT_BUCKET = process.env.MERCHANT_BUCKET_ID;


let db;
let isFnALive = false;

let mpContract;
let wlContract;
// let maContract;

export async function listenEvents() {
    if (isFnALive) {
        return;
    }

    console.log("live")
    isFnALive = true;
    if (!db) db = await database();
    const auction_col = db.collection("bucket_" + AUCTION_BUCKET);
    const user_col = db.collection("bucket_" + USER_BUCKET);
    const contractJson = await getContract()
    const mpContractAddress = contractJson.contracts.Marketplace.address;
    const mpContractAbi = contractJson.contracts.Marketplace.abi;
    // const maContractAddress = contractJson.contracts.MarketAgents.address;
    // const maContractAbi = contractJson.contracts.MarketAgents.abi;
    const wlContractAddress = contractJson.contracts.WISL.address;
    const wlContractAbi = contractJson.contracts.WISL.abi;
    const signerAddress = "0xde37eaecb5a2eee54499e586c1e23f37a3e5ed496e1701990e6bb76a0cadceb7";
    const jsonRpcUrl = "https://api.avax-test.network/ext/bc/C/rpc";
    const provider = new ethers.providers.JsonRpcProvider(jsonRpcUrl);
    const signer = new ethers.Wallet(signerAddress, provider);
    mpContract = new ethers.Contract(mpContractAddress, mpContractAbi, signer);
    wlContract = new ethers.Contract(wlContractAddress, wlContractAbi, signer);
    // maContract = new ethers.Contract(maContractAddress, maContractAbi, signer);
    mpContract.on("BidMade", async (auctionId, amount, dateInSeconds, account) => {
        console.log("Bid Request", auctionId, amount, dateInSeconds, account);
        const user = await user_col.findOne({ wallet: account });
        console.log("auctionId.toString() :", auctionId.toString(), { nft_id: (Number(auctionId.toString()) + 1).toString() })
        const auction = await auction_col.findOne({ nft_id: (Number(auctionId.toString()) + 1).toString() });
        if (!auction.bids) auction.bids = [];
        auction.bids = auction.bids.filter((item) => item['from'] != user._id.toString());
        auction.bids.push({
            created_at: new Date(Number(dateInSeconds.toString()) * 1000),
            'from': user._id.toString(),
            price: Number(ethers.utils.formatEther(amount)),
            status: "success"
        })
        await auction_col.updateOne({ _id: ObjectId(auction._id) }, { $set: { bids: auction.bids, } }).catch((e) => console.log("e :", e))

    });
    mpContract.on("BidCancelled", async (auctionId, account) => {
        console.log("BidCancelled Request", auctionId, account);
        const user = await user_col.findOne({ wallet: account });
        const auction = await auction_col.findOne({ nft_id: (Number(auctionId.toString()) + 1).toString() });
        if (!auction.bids) auction.bids = [];
        auction.bids = auction.bids.filter((item) => item['from'] != user._id.toString());
        await auction_col.updateOne({ _id: ObjectId(auction._id) }, { $set: { bids: auction.bids, } }).catch((e) => console.log("e :", e))
    });
    mpContract.on("AuctionSettled", async (auctionId, date, amount, settlementType, account) => {
        const auction = await auction_col.findOne({ nft_id: (Number(auctionId.toString()) + 1).toString() });
        const user = await user_col.findOne({ wallet: account });
        const product_col = db.collection(`bucket_${auction.collection_id}`)
        await auction_col.updateOne(
            { _id: ObjectId(auction._id) },
            {
                $set: {
                    in_auction: false,
                    can_bid: false,
                    owner: user._id.toString(),
                    transaction_info: {
                        amount: Number(ethers.utils.formatEther(amount)),
                        date: new Date(Number(date.toString() * 1000)),
                        settlement_type: Number(settlementType.toString()),
                        user: user._id.toString()
                    }
                }
            })
            .catch((e) => console.log("e :", e))
        await product_col.updateOne(
            { _id: ObjectId(auction.product_id) },
            {
                $set: { in_auction: false }
            })
            .catch((e) => console.log("e :", e))
    });
    wlContract.on("Transfer", async (fromAdress, toAdress, amount) => {
        console.log("Wisl Transfer Request", fromAdress, toAdress, Number(ethers.utils.formatEther(amount)), contractJson.contracts.Treasure.address);

        if (!(toAdress.toString() == contractJson.contracts.Treasure.address.toString()
            ||
            fromAdress.toString() == contractJson.contracts.Treasure.address.toString()))
            return

        const formattedAmount = Number(ethers.utils.formatEther(amount))
        const users = await user_col.find({ wallet: { $in: [fromAdress, toAdress] } }).toArray();
        for (const user of users) {
            if (!user.updated_at) user.updated_at = new Date();
            if (!(new Date().getTime() - new Date(user.updated_at) < 1000 * 5)) return
            const newBalance = user.wallet == fromAdress ? user.balance + formattedAmount : user.balance - formattedAmount;
            await user_col.updateOne({ _id: ObjectId(user._id) }, { $set: { balance: newBalance, updated_at: new Date() } })
        }

    });
    // maContract.on("Transfer", async (fromAdress, toAdress, tokenId) => {
    //     console.log("Market Agent Transfer Request", fromAdress, toAdress, tokenId);
    //     const market_agent_col = db.collection("bucket_" + MERCHANT_BUCKET);
    //     const fromUser = await user_col.findOne({ wallet: fromAdress.toString() })
    //     if (!fromUser || !fromUser.merchants || fromUser.merchants.length == 0) return;
    //     const merchant = await market_agent_col.findOne({ nft_id: tokenId.toString() })
    //     if (!merchant) return
    //     if (fromUser.merchants.includes(merchant._id.toString())) {
    //         await user_col.updateOne(
    //             { _id: ObjectId(fromUser._id) },
    //             {
    //                 $set: { merchants: fromUser.merchants.filter((item) => item != merchant._id.toString()) }
    //             })
    //     }
    // });

}

export function onContractChange(change) {
    if (change.current.key == "deployment_fuji") {
        mpContract.removeAllListeners();
        wlContract.removeAllListeners();
        // maContract.removeAllListeners();
        isFnALive = false;
        listenEvents();
    }
}


const getContract = async () => {
    if (!db) db = await database();
    const config_col = db.collection(`bucket_${CONFIG_BUCKET}`);
    const configData = await config_col.findOne({ key: "deployment_fuji" })
    const deploymentFji = await axios.get(configData.file);
    return deploymentFji.data;
}

