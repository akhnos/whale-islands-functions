import { database, ObjectId } from "@spica-devkit/database";
import * as Bucket from "@spica-devkit/bucket";
import * as Identity from "@spica-devkit/identity";
import jwt_decode from "jwt-decode";
import axios from "axios";

const SECRET_API_KEY = process.env.SECRET_API_KEY;
const USER_BUCKET = process.env.USER_BUCKET;
const SHIP_BUCKET = process.env.SHIP_BUCKET_ID;

const PASSWORD = "799qyk&{hM%B-4gh";
const CONFIG_BUCKET = process.env.CONFIG_BUCKET_ID;
const MERCHANT_BUCKET = process.env.MERCHANT_BUCKET_ID;

const MAILER_BUCKET = process.env.MAILER_BUCKET;
const VERIFICATION_CODE_BUCKET = process.env.VERIFICATION_CODE_BUCKET;

Identity.initialize({ apikey: SECRET_API_KEY });

let db;
async function register(wallet) {
    if (!db) db = await database().catch(err => {
        console.log("ERROR 1", err)
    })
    const userCollection = db.collection(`bucket_${USER_BUCKET}`);

    const identity = await Identity.insert({
        identifier: wallet,
        password: PASSWORD,
        policies: ["IdentityReadOnlyAccess", "BucketFullAccess", "StorageFullAccess"],
        attributes: { role: 'user' }
    }).catch(err => {
        console.log("identity insert err :", err);
        return err;
    });
    if (identity._id) {
        const userData = {
            wallet: wallet,
            identity: identity._id,
            username: await getUniqueUsername(identity._id, wallet),
            location_section: "61e67b89300d83002d303421",
            ships: ["61dedc99383252002d080fb6"],
            balance: 0,
            news_subscriber: false,
            wisl_requested: false,
            tutorial_step: 0,
            merchants: []
        }
        const user = await userCollection.insertOne(userData).catch((err) => console.log("ERROR 2", err));
        identity.attributes['user_id'] = user.ops[0]._id.toString()
        await Identity.update(identity._id, identity).catch(err => {
            console.log("identity update error ", err);
            return err;
        });
        return user.ops[0]
    }
    return null
}
export async function login(req, res) {
    let { identifier } = req.body;

    if (!db) db = await database().catch(err => {
        console.log("ERROR 1", err)
    })

    const shipCol = db.collection(`bucket_${SHIP_BUCKET}`);
    console.log("USER LOGIN  REQUEST...", req)
    let user;
    if (!identifier) return res.status(400).send({ message: "Invalid wallet provided" });
    const data = await Identity.login(identifier, PASSWORD).catch(async error => {
        console.log("error :", error)
    });
    if (data) {
        const decoded = jwt_decode(data);
        user = await getUserByWallet(decoded.identifier)
        user['token'] = data
    }
    else {
        user = await register(identifier);
        if (user) {
            const newIdentity = await Identity.login(identifier, PASSWORD).catch(async error => {
                console.log("error :", error)
            });
            user['token'] = newIdentity
        }

    }
    if (!user) return res.status(400).send({ message: "Something went wrong" });

    // checkMyNfts(user)
    return res.status(200).send({ user: user });

}

async function getUserByWallet(wallet) {
    if (!db) db = await database().catch(err => {
        console.log("ERROR 3", err)
    })
    const userCollection = db.collection(`bucket_${USER_BUCKET}`);
    const user = await userCollection.findOne({ wallet: wallet }).catch(err => console.log("ERROR", err))
    const shipCol = db.collection(`bucket_${SHIP_BUCKET}`);
    if (user.ships && user.ships.length > 0)
        user.ships = await shipCol.find({ _id: { $in: user.ships.map((ship) => ObjectId(ship)) } }).toArray();
    return user;
}


async function checkMyNfts(user) {
    if (!user.merchants) return;
    const contractJson = await getContract()
    const { ethers } = require("ethers");
    const maContractAddress = contractJson.contracts.MarketAgents.address;
    const maContractAbi = contractJson.contracts.MarketAgents.abi;
    const signerAddress = "0xde37eaecb5a2eee54499e586c1e23f37a3e5ed496e1701990e6bb76a0cadceb7";
    const jsonRpcUrl = "https://api.avax-test.network/ext/bc/C/rpc";
    const provider = new ethers.providers.JsonRpcProvider(jsonRpcUrl);
    const signer = new ethers.Wallet(signerAddress, provider);
    const maContract = new ethers.Contract(maContractAddress, maContractAbi, signer);
    const merchant_collection = db.collection(`bucket_${MERCHANT_BUCKET}`);
    const user_collection = db.collection(`bucket_${USER_BUCKET}`);

    let itemsRedeemed = (
        await maContract.balanceOf(user.wallet)
    ).toString();

    if (!itemsRedeemed) return;
    let userNFTs = [];
    if (Number(itemsRedeemed) > 0) {
        for (let x = 0; x < Number(itemsRedeemed); x++) {
            let nft = (
                await maContract.tokenOfOwnerByIndex(
                    user.wallet,
                    x
                )
            ).toString();
            userNFTs.push((Number(nft) + 1).toString());
        }
    }
    const userMerchants = await merchant_collection.find({ _id: { $in: user.merchants.map((item) => ObjectId(item)) } }).toArray();
    let findNotOwnAgent = false;
    for (const item of userMerchants) {
        if (!userNFTs.includes(item.nft_id)) {
            user.merchants = user.merchants.filter((merchant) => merchant != item._id)
            findNotOwnAgent = true
        }
    }
    if (findNotOwnAgent) await user_collection.updateOne({ _id: ObjectId(user._id) }, { $set: { merchants: user.merchants } })

}

// Helpers
const getContract = async () => {
    if (!db) db = await database();
    const config_col = db.collection(`bucket_${CONFIG_BUCKET}`);
    const configData = await config_col.findOne({ key: "deployment_fuji" })
    const deploymentFji = await axios.get(configData.file);
    return deploymentFji.data;
}

async function getUniqueUsername(identity, wallet) {
    if (!db) db = await database().catch(err => {
        console.log("ERROR 1", err)
    })
    let retunedUsername = "Unnamed";
    retunedUsername = await checkExist(identity, wallet)
    return retunedUsername
}
async function checkExist(identity, wallet) {
    const userCollection = db.collection(`bucket_${USER_BUCKET}`);
    const splicedNumbers = {
        identity: -3,
        wallet: -2
    }
    const tryUniq = "Unnamed" + identity.substr(splicedNumbers.identity)
        + wallet.substr(splicedNumbers.wallet)
    const existUser = await userCollection.find({ username: tryUniq }).toArray();
    if (existUser[0]) { splicedNumbers.identity--; splicedNumbers.wallet--; return checkExist(); }
    return tryUniq;
}
//Helpers End


// NEW FUNCTIONS

export async function login_v2(req, res) {
    let { email, password, wallet } = req.body;
    return Identity.login(email, password)
        .then(async jwt => {
            const decoded = jwt_decode(jwt);
            if (decoded.attributes.wallet != wallet) {
                return res.status(400).send({ message: "Please select the correct wallet" });
            }
            let user = await getUserByIdentity(String(decoded._id))
            
            if (user && user.is_verified) {
                user['token'] = jwt
                // checkMyNfts(user)
                return res.status(200).send({ user: user });
            }

            return res.status(400).send({ message: "User not verified" });
        })
        .catch((error) => {
            return res.status(400).send(error);
        });
}

export async function register_v2(req, res) {
    let { wallet, email, password } = req.body;

    if (!db) db = await database().catch(err => { console.log("ERROR 3", err) })

    const identityCollection = db.collection(`identity`);
    const userCollection = db.collection(`bucket_${USER_BUCKET}`);

    const cancidateIdentity = await identityCollection.findOne({ "attributes.wallet": wallet }).catch(err => { console.log("ERROR", err) })

    if (cancidateIdentity) {
        const candidateData = await getUserByWallet(wallet);
        if (candidateData.email != email) {
            return res.status(400).send({ message: `This wallet is registered with "${candidateData.email}" email` });
        } else if (!candidateData.is_verified) {
            cancidateIdentity["password"] = password
            await Identity.update(cancidateIdentity._id, cancidateIdentity).catch(err => console.log("ERROR", err))
        } else {
            return res.status(400).send({ message: "User exists" });
        }
    } else {
        const identity = await Identity.insert({
            identifier: email,
            password: password,
            policies: ["IdentityReadOnlyAccess", "BucketFullAccess", "StorageFullAccess"],
            attributes: { role: 'user', wallet: wallet }
        }).catch(err => {
            console.log("identity insert err :", err);
            return err;
        });

        if (!identity._id) {
            return res.status(400).send(identity);
        }

        const userData = {
            email: email,
            wallet: wallet,
            identity: identity._id,
            username: await getUniqueUsername(identity._id, wallet),
            location_section: "61e67b89300d83002d303421",
            ship: ["61dedc99383252002d080fb6"],
            balance: 0,
            news_subscriber: false,
            wisl_requested: false,
            tutorial_step: 0,
            merchants: [],
            is_verified: false
        }
        const user = await userCollection.insertOne(userData).catch((err) => console.log("ERROR 2", err));

        identity.attributes['user_id'] = user.ops[0]._id.toString()

        await Identity.update(identity._id, identity).catch(err => {
            console.log("identity update error ", err);
            return err;
        });
    }

    const code = codeGenerate(5)
    insertVerificationCode(email, code, 'register')
    await sendVerificationCode(email, code, 'register')

    return res.status(200).send({ message: "We have sent a confirmation code to your email" });
}

export async function verifyCode(req, res) {
    const { email, code, action } = req.body;

    let now = new Date();

    if (!db) db = await database().catch(err => { console.log("ERROR 3", err) })

    const verificationCodeCollection = db.collection(`bucket_${VERIFICATION_CODE_BUCKET}`);
    const codeData = await verificationCodeCollection.findOne({ email: email, code: Number(code), action: action, used: false, enabled: true })
        .catch(err => console.log("ERROR", err))

    if (!codeData) {
        return res.status(400).send({ message: "Invalid code" });
    }

    if (now > codeData.expiry_date) {
        return res.status(400).send({ message: "Code expired" });
    }

    if (action == "register") {
        updateUserVerifiedStatus(email);
    }

    await verificationCodeCollection.findOneAndUpdate({ _id: codeData._id }, { $set: { used: true, enabled: false } })
        .catch(err => console.log("ERROR", err))

    return res.status(200).send({ message: "Code verified successfully" });
}

export async function recoveryPassword(req, res) {
    const { email } = req.body;

    if (!db) db = await database().catch(err => { console.log("ERROR 3", err) })

    const userCollection = db.collection(`bucket_${USER_BUCKET}`);
    const userData = await userCollection.findOne({ email: email, is_verified: true }).catch(err => console.log("ERROR: 35", err));

    if (!userData) {
        return res.status(400).send({ message: "User not verified" });
    }

    const code = codeGenerate(5)
    insertVerificationCode(email, code, 'forgot_password')
    await sendVerificationCode(email, code, 'register')
    return res.status(200).send({ message: "We have sent a confirmation code to your email" });
}

export async function setNewPassword(req, res) {
    let { email, password } = req.body;
    let now = new Date();

    if (!db) db = await database().catch(err => { console.log("ERROR 3", err) })

    const identityCollection = db.collection(`identity`);
    const verificationCodeCollection = db.collection(`bucket_${VERIFICATION_CODE_BUCKET}`);

    const codeData = await verificationCodeCollection.findOne({ email: email, action: "forgot_password", used: true, expiry_date: { $gte: now } })
        .catch(err => console.log("ERROR", err))

    if (!codeData) {
        console.log("WARNING: attempt to change password without confirmation")
        return res.status(400).send({ message: "An error has occurred, please contact us" });
    }
    const identity = await identityCollection.findOne({ identifier: email }).catch(err => console.log("ERROR", err))

    if (!identity) {
        return res.status(400).send({ message: "User not verified" });
    }

    identity["password"] = password

    await Identity.update(identity._id, identity).catch(err => console.log("ERROR", err))

    return res.status(200).send({ message: "Password Reset Successfully" });
}

export async function resendVerificationCode(req, res) {
    let { email, action } = req.body;

    const code = codeGenerate(5)
    insertVerificationCode(email, code, action)
    await sendVerificationCode(email, code, action)

    return res.status(200).send({ message: "The verification code has been resend" });
}

async function sendVerificationCode(email, code, action) {
    let mailData = {};
    if (action == 'register') {
        mailData = {
            title: "Verification Code",
            template: "verification-mail",
            variables: `{"code": "${code}", "email": "${email}"}`,
            emails: [email]
        }
    } else if (action == 'forgot_password') {
        mailData = {
            title: "Verification Code",
            template: "password-recovery-mail",
            variables: `{"code": "${code}", "email": "${email}"}`,
            emails: [email]
        }
    }

    await sendMail(mailData);
}

async function sendMail(mailData) {
    Bucket.initialize({ apikey: SECRET_API_KEY });
    return Bucket.data
        .insert(MAILER_BUCKET, {
            title: mailData.title,
            template: mailData.template,
            variables: mailData.variables,
            emails: mailData.emails,
        })
        .catch(err => console.log("ERROR: 35", err));
}

async function getUserByIdentity(identity) {
    if (!db) db = await database().catch(err => { console.log("ERROR 3", err) })
    const userCollection = db.collection(`bucket_${USER_BUCKET}`);
    const user = await userCollection.findOne({ identity: identity }).catch(err => console.log("ERROR", err))
    const shipCol = db.collection(`bucket_${SHIP_BUCKET}`);
    if (user.ships && user.ships.length > 0)
        user.ships = await shipCol.find({ _id: { $in: user.ships.map((ship) => ObjectId(ship)) } }).toArray();
    return user;
}

async function insertVerificationCode(email, code, action) {
    let expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 1)

    if (!db) db = await database().catch(err => { console.log("ERROR 3", err) })

    const verificationCodeCollection = db.collection(`bucket_${VERIFICATION_CODE_BUCKET}`);

    await verificationCodeCollection.updateMany({ email: email }, { $set: { enabled: false } }).catch(err => { console.log("ERROR", err) })
    return verificationCodeCollection.insertOne({
        email: email,
        code: code,
        action: action,
        expiry_date: expiryDate,
        used: false,
        enabled: true
    })
        .catch(err => console.log("ERROR", err))
}

async function updateUserVerifiedStatus(email) {
    if (!db) db = await database().catch(err => { console.log("ERROR 3", err) })
    const userCollection = db.collection(`bucket_${USER_BUCKET}`);
    return userCollection.findOneAndUpdate({ email: email }, { $set: { is_verified: true } }).catch(err => console.log("ERROR", err))
}

function codeGenerate(length) {
    let result = "";
    let characters = "123456789";
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return parseInt(result);
}