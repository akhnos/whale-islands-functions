import { database, ObjectId } from "@spica-devkit/database";
const { ethers } = require("ethers");
import axios from "axios";
import jwt_decode from "jwt-decode";


const USER_BUCKET = process.env.USER_BUCKET;
const CONFIG_BUCKET = process.env.CONFIG_BUCKET_ID;

let db;
const getToken = (headers) => {
    const authorization = headers.get("authorization");
    if (!authorization) return null;
    const token = authorization.split(" ")[1]; //Expect IDENTITY eyJhbGciOiJIU...IEUV_0dsmLZ4JE
    return token;
}
const getIdentity = async (token) => {
    try {
        const decoded = await jwt_decode(token);
        return decoded;
    }
    catch{
        ((e) => { console.log("JWT error :", e) })
    }
}


export async function requestWisl(req, res) {
    const { wallet } = req.body;

    if (!db) db = await database()
    const user_collection = db.collection(`bucket_${USER_BUCKET}`);
    const user = await user_collection.findOne({ wallet: wallet, wisl_requested: false }).catch(err => console.log("ERROR 0", err))

    if (user) {
        try {
            await mint(wallet, ethers.utils.parseEther("500"));
            await user_collection.updateOne(
                { wallet: wallet, wisl_requested: false },
                {
                    $inc: { balance: 500 },
                    $set: { wisl_requested: true }
                }
            ).catch(err => console.log("ERROR 1", err))
            return res.status(200).send({ message: "Successfully" });
        } catch (err) {
            console.log("ERROR 3", err);
            return res.status(400).send({ message: "Error, please try later" });
        }
    } else {
        return res.status(400).send({ message: "Can only be requested once" });
    }
}

async function mint(address, amount) {
    const contractJson = await getContract();
    const contractAddress = contractJson.contracts.WISL.address;
    const contractAbi = contractJson.contracts.WISL.abi;
    const jsonRpcUrl = "https://api.avax-test.network/ext/bc/C/rpc";
    const minter = "0xde37eaecb5a2eee54499e586c1e23f37a3e5ed496e1701990e6bb76a0cadceb7";

    const provider = new ethers.providers.JsonRpcProvider(jsonRpcUrl);
    const wallet = new ethers.Wallet(minter, provider);
    const contract = new ethers.Contract(contractAddress, contractAbi, wallet);

    // const userBalance = (await contract.balanceOf(address)).toString();
    await contract.mint(address, amount)
}

const getContract = async () => {
    if (!db) db = await database();
    const config_col = db.collection(`bucket_${CONFIG_BUCKET}`);
    const configData = await config_col.findOne({ key: "deployment_fuji" })
    const deploymentFji = await axios.get(configData.file);
    return deploymentFji.data;
}
export async function withdrawWisl(req, res) {
    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");
    
    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");
    
    if (!db) db = await database();
    
    const { amount } = req.body
    
    const user_col = db.collection(`bucket_${USER_BUCKET}`)
    const user = await user_col.findOne(ObjectId(identity.attributes.user_id))
    
    if (user.balance < amount) return res.status(403).send({ message: "You don't have enough money in your account!" });
    
    const contractJson = await getContract();
    const contractAddress = contractJson.contracts.Treasure.address;
    const contractAbi = contractJson.contracts.Treasure.abi;
    const jsonRpcUrl = "https://api.avax-test.network/ext/bc/C/rpc";
    const minter = "0xde37eaecb5a2eee54499e586c1e23f37a3e5ed496e1701990e6bb76a0cadceb7";

    const provider = new ethers.providers.JsonRpcProvider(jsonRpcUrl);
    const wallet = new ethers.Wallet(minter, provider);
    const contract = new ethers.Contract(contractAddress, contractAbi, wallet);
    // const userBalance = (await contract.balanceOf(address)).toString();
    try {
        await contract.transferWislTo(user.wallet, ethers.utils.parseEther(amount.toString()))
    } catch (e) {
        return res.status(500).send("Something went wrong! Try again later.")
    }
    return res.status(200).send("Success")
}