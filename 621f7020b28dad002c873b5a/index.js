import { database, ObjectId } from "@spica-devkit/database";
import * as Identity from "@spica-devkit/identity";
import * as Bucket from "@spica-devkit/bucket";

import jwt_decode from "jwt-decode";
import axios from "axios";

const initializeIdentity = (token) => {
    Identity.initialize({ identity: token })
    Bucket.initialize({ identity: token })
}
const getToken = (headers) => {
    const authorization = headers.get("authorization");
    if (!authorization) return null;
    const token = authorization.split(" ")[1]; //Expect IDENTITY eyJhbGciOiJIU...IEUV_0dsmLZ4JE
    if (token) initializeIdentity(token)
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

const MARKET_AGENT_BUCKET = process.env.MARKET_AGENT_BUCKET_ID;
const USER_BUCKET = process.env.USER_BUCKET_ID;
const CITY_BUCKET = process.env.CITY_BUCKET_ID;
// const CONFIG_BUCKET = process.env.CONFIG_BUCKET_ID;
const MARKET_AGENT_JOURNEY_BUCKET = process.env.MARKET_AGENT_JOURNEY_BUCKET_ID;
const SECTION_BUCKET = process.env.SECTION_BUCKET_ID;
const UPGRADES_BUCKET = process.env.UPGRADES_BUCKET_ID;


let db;

export async function getAgents(req, res) {

    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");
    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");
    if (!db) db = await database();

    const agent_collection = db.collection(`bucket_${MARKET_AGENT_BUCKET}`);
    const user_collection = db.collection(`bucket_${USER_BUCKET}`);
    const city_collection = db.collection(`bucket_${CITY_BUCKET}`);

    const user = await user_collection.findOne({ identity: identity._id });
    if (user.merchants && user.merchants.length > 0) {
        const agents = await agent_collection.find({ _id: { $in: user.merchants.map((item) => ObjectId(item)) } }).toArray();
        const cities = await city_collection.find({
            _id: {
                $in: agents.filter((item) => item.city)
                    .map((merchant) => ObjectId(merchant.city))
            }
        }).toArray();

        agents.forEach((agent) => {
            agent.city = agent.city && cities.find((item) => item._id.toString() == agent.city.toString());
            agent.upgrade = {
                price: getUpgradePrice(agent),
                cooldown: getAgentCooldown(agent)
            }
            return agent
        })
        return res.status(200).send(agents)
    }
    return res.status(200).send([])
}
export async function collectWisl(req, res) {

    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");

    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");

    const { agentId } = req.body;

    if (!db) db = await database();
    const user_collection = db.collection(`bucket_${USER_BUCKET}`);
    const agent_collection = db.collection(`bucket_${MARKET_AGENT_BUCKET}`);

    const user = await user_collection.findOne(ObjectId(identity.attributes.user_id));
    if (!user.merchants.includes(agentId)) return res.status(403).send("Agent is not yours!")

    const agent = await agent_collection.findOne(ObjectId(agentId));

    user.balance += agent.collectable_wisl
    await Bucket.data.patch(USER_BUCKET, user._id.toString(), { balance: user.balance })

    await agent_collection.updateOne({ _id: ObjectId(agentId) }, { $set: { collectable_wisl: 0 } });

    return res.status(200).send("Ok")
}

const getAgentPoint = (agent) => {
    const attributes = ["speed", "network", "power", "safe"];
    let agentPoint = 0;
    let upgradePoint = 1;
    let totalPoint = attributes.length * 100;
    attributes.forEach((item) => {
        if (item == "safe") {
            upgradePoint = 10
            agentPoint += agent[item] / 10;
        }
        else
            agentPoint += agent[item]
    })
    return { agentPoint, upgradePoint, totalPoint }
}

const getAgentCooldown = (agent) => {
    let { agentPoint } = getAgentPoint(agent)

    let totalCooldown = Math.pow(agentPoint, 2) / 400;

    let leftNow = new Date(agent.upgrade_date || 954238308000).getTime() + (totalCooldown * 60 * 1000);
    console.log("agent :", agent, "agentPoint :", agentPoint, "totalCooldown :", totalCooldown, "leftNow :", leftNow)
    let leftCooldown = (new Date(leftNow) - new Date()) / 1000;


    return { total: Math.round(totalCooldown * 60), left: totalCooldown * 60 - leftCooldown > 0 ? Math.round(leftCooldown) : 0 }
}
const getUpgradePrice = (agent) => {
    const easeInOutQuad = (x) => {
        return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    }
    let { agentPoint, totalPoint } = getAgentPoint(agent)
    return easeInOutQuad(agentPoint / totalPoint) * 100;
}
export async function upgradeAgent(req, res) {

    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");

    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");

    const { agentId, attribute } = req.body;

    if (!db) db = await database();
    const user_collection = db.collection(`bucket_${USER_BUCKET}`);
    const agent_collection = db.collection(`bucket_${MARKET_AGENT_BUCKET}`);
    const upgrades_collection = db.collection(`bucket_${UPGRADES_BUCKET}`);

    const user = await user_collection.findOne(ObjectId(identity.attributes.user_id));
    if (!user.merchants && !user.merchants.includes(agentId)) return res.status(403).send("Agent is not yours!")

    const agent = await agent_collection.findOne(ObjectId(agentId));
    if (!agent[attribute]) return res.status(400).send("Bad Request! Wrong attribute.")
    if (getAgentCooldown(agent).left > 0) return res.status(400).send("Bad Request! Colldown continue.")



    let { agentPoint, upgradePoint, totalPoint } = getAgentPoint(agent)

    let upgradeFee = getUpgradePrice(agent)
    if (user.balance < upgradeFee) return res.status(400).send("Bad Request! Balance not enought.")
    if (agentPoint >= totalPoint) return res.status(400).send("Bad Request! Have Max point.")

    user.balance -= upgradeFee
    await Bucket.data.patch(USER_BUCKET, user._id.toString(), { balance: user.balance })

    const dateNow = new Date()
    await upgrades_collection.insertOne({
        user: user._id.toString(),
        nft_id: agent.nft_id,
        attribute,
        created_at: dateNow
    })


    await agent_collection.updateOne(
        { _id: ObjectId(agentId) },
        {
            $inc: {
                [attribute]: upgradePoint
            },
            $set: {
                upgrade_date: dateNow
            }
        });
    agent.upgrade_date = dateNow;
    agent[attribute] += upgradePoint;
    return res.status(200).send({
        cooldown: getAgentCooldown(agent)
    })
}

export async function sendAgent(req, res) {
    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");
    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");
    if (!db) db = await database();

    const { merchantId, target_position, current_position, cityId } = req.body;

    console.log("sendMerchant :", merchantId, target_position, current_position, cityId, req.body)
    const merchant_collection = db.collection(`bucket_${MARKET_AGENT_BUCKET}`);
    const user_collection = db.collection(`bucket_${USER_BUCKET}`);

    const user = await user_collection.findOne({ identity: identity._id });
    const merchant = await merchant_collection.findOne(ObjectId(merchantId));

    if (!merchant) return res.status(400).send(`Not found merchant by this id ${merchantId}`)

    if (user.merchants && user.merchants.length > 0 && user.merchants.includes(merchantId.toString())) {
        const merchants = await merchant_collection.find({ _id: { $in: user.merchants.map((item) => ObjectId(item)) } }).toArray();
        const existMerchant = merchants.find((item) => item.city && (item.city.toString() == cityId.toString()));
        if (existMerchant) {
            if (existMerchant._id.toString() != merchantId) {
                await merchant_collection.updateOne({ _id: ObjectId(existMerchant._id) }, { $unset: { city: 1 } })
            }
            else return res.status(400).send(`This merchant ${merchantId} already in this city`)
        }
        const market_agent_journey_coll = db.collection(`bucket_${MARKET_AGENT_JOURNEY_BUCKET}`);
        const section_collection = db.collection(`bucket_${SECTION_BUCKET}`);
        const userSection = await section_collection.findOne(ObjectId(user.location_section));
        const journey = {
            created_at: new Date(),
            user: user._id,
            market_agent: merchant._id,
            target_position: {
                "type": "Point",
                "coordinates": [
                    target_position[0] + userSection.long_max / 2,
                    target_position[1] + userSection.lat_max / 2
                ]
            },
            current_position: {
                "type": "Point",
                "coordinates": [
                    current_position[0] + userSection.long_max / 2,
                    current_position[1] + userSection.lat_max / 2
                ]
            },
            is_completed: false,
            city: cityId,
            duration: -1
        }
        const newNormalizedJourney = getNewLocationsBySection(journey, userSection, (position, sectionMax) => position / sectionMax)
        newNormalizedJourney.duration = await axios.get("https://" + req.headers.get("host") + "api/fn-execute/getDuration", {
            params: {
                startPoint: journey.current_position,
                endPoint: journey.target_position,
                mapId: userSection.id.toString(),
                speed: merchant.speed
            }
        }).then((durationData) => durationData.data)
        const newJourney = await market_agent_journey_coll.insertOne(newNormalizedJourney)
        await merchant_collection.updateOne({ _id: ObjectId(merchant._id) }, { $unset: { city: 1 } })
        return res.status(200).send(newJourney.insertedId.toString())
    }
    return res.status(401).send("This merchant is not yours")
}


//Helpers 

function getNewLocationsBySection(journey, section, sectionTransformFunc) {
    journey.target_position.coordinates[0] = sectionTransformFunc(journey.target_position.coordinates[0], section.long_max);
    journey.target_position.coordinates[1] = sectionTransformFunc(journey.target_position.coordinates[1], section.lat_max);
    journey.current_position.coordinates[0] = sectionTransformFunc(journey.current_position.coordinates[0], section.long_max);
    journey.current_position.coordinates[1] = sectionTransformFunc(journey.current_position.coordinates[1], section.lat_max);
    return journey;
}

//Helpers end



// async function batchAuction(auctions) {
// 	// if (!db) db = await database();
// 	// const auction_collection = db.collection(`bucket_${AUCTION_BUCKET}`);
// 	// const auctions = await auction_collection.find().toArray()
// 	// console.log("auctions :", auctions)
// 	const { ethers, BigNumber } = require("ethers");
// 	const contractJson = await getContract();
// 	const contractAddress = contractJson.contracts.Marketplace.address;
// 	const contractAbi = contractJson.contracts.Marketplace.abi;
// 	const signerAddress = "0xde37eaecb5a2eee54499e586c1e23f37a3e5ed496e1701990e6bb76a0cadceb7";
// 	const jsonRpcUrl = "https://api.avax-test.network/ext/bc/C/rpc";
// 	const provider = new ethers.providers.JsonRpcProvider(jsonRpcUrl);
// 	const signer = new ethers.Wallet(signerAddress, provider);
// 	const contract = new ethers.Contract(contractAddress, contractAbi, signer);
// 	// for (const item of auctions) {
// 	// 	console.log("item :", {
// 	// 		endTime: BigNumber.from(Math.floor((new Date(item.end_date).getTime()) / 1000)),
// 	// 		minPrice: ethers.utils.parseEther(item.min_price.toString()),
// 	// 		buyNowPrice: ethers.utils.parseEther(item.price.toString()),
// 	// 		nftId: BigNumber.from(item.nft_id),
// 	// 		// nftContract: contractJson.contracts.MarketAgents.address // Market Agent
// 	// 	}, item)
// 	// 	await contract.createAuction({
// 	// 		endTime: BigNumber.from(Math.floor((new Date(item.end_date).getTime()) / 1000)),
// 	// 		minPrice: ethers.utils.parseEther(item.min_price.toString()),
// 	// 		buyNowPrice: ethers.utils.parseEther(item.price.toString()),
// 	// 		nftId: BigNumber.from(item.nft_id),
// 	// 		// nftContract: contractJson.contracts.MarketAgents.address // Market Agent
// 	// 	}).catch((e) => console.log("e :", e))
// 	// }
// 	await contract.batchCreateAuction(auctions.map((item) => {
// 		const auctionData = {
// 			endTime: BigNumber.from(Math.floor((new Date(item.end_date).getTime()) / 1000)),
// 			minPrice: ethers.utils.parseEther(item.min_price.toString()),
// 			buyNowPrice: ethers.utils.parseEther(item.price.toString()),
// 			nftId: BigNumber.from(item.nft_id),
// 			// nftContract: contractJson.contracts.MarketAgents.address // Market Agent
// 		}
// 		return auctionData
// 	})).catch((e) => console.log("e :", e))
// 	return {}
// }

// const getContract = async () => {
// 	if (!db) db = await database();
// 	const config_col = db.collection(`bucket_${CONFIG_BUCKET}`);
// 	const configData = await config_col.findOne({ key: "deployment_fuji" })
// 	const deploymentFji = await axios.get(configData.file);
// 	return deploymentFji.data;
// }