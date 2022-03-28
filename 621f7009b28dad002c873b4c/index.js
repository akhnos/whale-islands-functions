import { database, ObjectId } from "@spica-devkit/database";
import * as Identity from "@spica-devkit/identity";
import jwt_decode from "jwt-decode";
import axios from "axios"

const initializeIdentity = (token) => {
    Identity.initialize({ identity: token })
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

const JOURNEY_BUCKET = process.env.JOURNEY_BUCKET_ID;
const SECTION_BUCKET = process.env.SECTION_BUCKET_ID;
const USER_BUCKET = process.env.USER_BUCKET_ID;
const MARKET_AGENT_JOURNEY_BUCKET = process.env.MARKET_AGENT_JOURNEY_BUCKET_ID;
const MARKET_AGENT_BUCKET = process.env.MARKET_AGENT_BUCKET_ID;
const SHIP_BUCKET = process.env.SHIP_BUCKET_ID;

const API_URL = "https://whale-islands-stg-c92f1.hq.spicaengine.com/api"

let db;


export async function completePlayerJourney(req, res) {
    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");
    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");

    let journey = req.body;
    if (!db) db = await database();
    const journey_collection = db.collection(`bucket_${JOURNEY_BUCKET}`);

    if (!journey._id) return res.status(400).send("Bad Request!");
    journey = await journey_collection.findOne(ObjectId(journey._id));

    if (journey.user != identity.attributes.user_id)
        return res.status(403).send("Permission Error!")

    const arrivalDate = new Date(new Date(journey.created_at).getTime() + Number(journey.duration))

    if (new Date() < arrivalDate) return res.status(201).send("Should not arrived yet!");

    await journey_collection.updateOne({ _id: ObjectId(journey._id) }, {
        $set: {
            is_completed: true,
        }
    }).catch((e) => console.log("default function error :", e));

    return res.status(201).send({ message: "Ok", _id: req.body._id });
}
export async function startPlayerJourney(req, res) {
    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");
    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");

    const journey = req.body;
    console.log("startPlayerJourney : ", journey)
    if (!db) db = await database();
    const journey_collection = db.collection(`bucket_${JOURNEY_BUCKET}`);
    const section_collection = db.collection(`bucket_${SECTION_BUCKET}`);
    const user_collection = db.collection(`bucket_${USER_BUCKET}`);
    const ship_collection = db.collection(`bucket_${SHIP_BUCKET}`);
    const user = await user_collection.findOne({ identity: identity._id });
    const ships = await ship_collection.find({ _id: { $in: user.ships.map((item) => ObjectId(item)) } }).toArray();

    journey.user = user._id.toString();
    const userSection = await section_collection.findOne(ObjectId(user.location_section));
    journey.created_at = new Date();
    
    if (journey.city_id && journey.city_id != "")
        journey.city = journey.city_id;
    else delete journey.city_id;

    journey.target_position = {
        "type": "Point",
        "coordinates": [
            journey.target_position[0] + userSection.long_max / 2,
            journey.target_position[1] + userSection.lat_max / 2
        ]
    };
    journey.current_position = {
        "type": "Point",
        "coordinates": [
            journey.current_position[0] + userSection.long_max / 2,
            journey.current_position[1] + userSection.lat_max / 2
        ]
    };
    journey.is_completed = false;
    journey.duration = -1;

    const newChangedLocationJourney = getNewLocationsBySection(
        journey,
        userSection,
        (position, sectionMax) => position / sectionMax
    );
    const newJourney = await journey_collection.insertOne(newChangedLocationJourney)
        .catch((e) => console.log("something went wrong when journey_collection.insertOne", e))
    //Update duration after insert with asynchrone
    journey._id = newJourney.insertedId.toString();
    await setDuration(journey, userSection.id.toString(), ships.sort((a, b) => a.speed - b.speed)[0].speed)
    //
    if (!newJourney) {
        return res.status(400).send("Bad Request!");;
    }
    return res.status(201).send(newJourney.insertedId.toString());

}
async function setDuration(journey, sectionId, speed) {
    if (!db) db = await database();
    const journey_collection = db.collection(`bucket_${JOURNEY_BUCKET}`);
    const expectDuration = await axios.get(API_URL + "/fn-execute/getDuration", {
        params: {
            startPoint: journey.current_position,
            endPoint: journey.target_position,
            mapId: sectionId,
            speed
        }
    }).then(async (durationData) => durationData.data)
    await journey_collection.updateOne({ _id: ObjectId(journey._id) }, { $set: { duration: expectDuration } })
        .catch((e) => console.log("something went wrong when journey_collection.updateOne", e))
}
export async function arrivedMarketAgentJourney(req, res) {
    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");
    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");

    let journey = req.body;

    if (!db) db = await database();
    const journey_collection = db.collection(`bucket_${MARKET_AGENT_JOURNEY_BUCKET}`);
    const user_collection = db.collection(`bucket_${USER_BUCKET}`);
    const market_agent_collection = db.collection(`bucket_${MARKET_AGENT_BUCKET}`);

    if (!journey._id) return res.status(400).send("Bad Request!");
    journey = await journey_collection.findOne(ObjectId(journey._id));
    if (!journey) return res.status(400).send("Bad Request!");
    const user = await user_collection.findOne(ObjectId(journey.user));
    console.log("user :", user, "identity :", identity, "journey :", journey)

    if (!user || !user.merchants ||
        journey.user.toString() != identity.attributes.user_id ||
        !user.merchants.includes(journey.market_agent.toString()))
        return res.status(403).send("Permission Error!")

    const arrivalDate = new Date(new Date(journey.created_at).getTime() + journey.duration)
    if (new Date() < arrivalDate) return res.status(400).send("Should not arrived yet!");

    await market_agent_collection.updateOne(
        { _id: ObjectId(journey.market_agent) },
        { $set: { city: journey.city } }).catch((e) => console.log("error :", e));

    await journey_collection.updateOne({ _id: ObjectId(journey._id) }, {
        $set: {
            is_completed: true,
        }
    }).catch((e) => console.log("error :", e));

    return res.status(201).send({ message: "Ok", _id: req.body._id });
}
function getNewLocationsBySection(journey, section, sectionTransformFunc) {
    journey.target_position.coordinates[0] = sectionTransformFunc(journey.target_position.coordinates[0], section.long_max);
    journey.target_position.coordinates[1] = sectionTransformFunc(journey.target_position.coordinates[1], section.lat_max);
    journey.current_position.coordinates[0] = sectionTransformFunc(journey.current_position.coordinates[0], section.long_max);
    journey.current_position.coordinates[1] = sectionTransformFunc(journey.current_position.coordinates[1], section.lat_max);
    return journey;
}
export async function getJourney(req, res) {
    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");
    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");
    if (!db) db = await database();
    const journeys = { user: { _id: -1 }, market_agents: [] };
    const journey_collection = db.collection(`bucket_${JOURNEY_BUCKET}`);
    const market_agent_journey_coll = db.collection(`bucket_${MARKET_AGENT_JOURNEY_BUCKET}`);
    const section_collection = db.collection(`bucket_${SECTION_BUCKET}`);
    const user_collection = db.collection(`bucket_${USER_BUCKET}`);
    const market_agent_coll = db.collection(`bucket_${MARKET_AGENT_BUCKET}`);
    const user = await user_collection.findOne({ identity: identity._id });
    const userSection = await section_collection.findOne(ObjectId(user.location_section));
    const lastJourney = await journey_collection.find({ user: user._id.toString() }).sort({ "_id": -1 }).limit(1).toArray();

    let lastMarketAgentJourneys = await market_agent_journey_coll.aggregate([
        {
            $match:
            {
                user: identity.attributes.user_id
            }
        },
        { $sort: { "_id": -1 } },
        { $group: { "_id": "$market_agent", "doc": { "$first": "$$ROOT" } } },
        { $replaceRoot: { "newRoot": "$doc" } },
    ]).toArray()

    if (lastJourney && lastJourney.length > 0) {
        journeys.user = getNewLocationsBySection(
            lastJourney[0],
            userSection,
            (position, sectionMax) => position * sectionMax
        );
        journeys.user.target_position.coordinates[0] -= userSection.long_max / 2;
        journeys.user.target_position.coordinates[1] -= userSection.lat_max / 2;
        journeys.user.current_position.coordinates[0] -= userSection.long_max / 2;
        journeys.user.current_position.coordinates[1] -= userSection.lat_max / 2;
    }
    if (lastMarketAgentJourneys && lastMarketAgentJourneys.length > 0) {
        const oldAgentDatas = lastMarketAgentJourneys.filter((item) => !user.merchants.includes(item.market_agent))
        if (oldAgentDatas.length > 0) {
            await market_agent_journey_coll.deleteMany({ _id: { $in: oldAgentDatas.map((oad) => ObjectId(oad._id)) } })
            lastMarketAgentJourneys = lastMarketAgentJourneys.filter((item) => user.merchants.includes(item.market_agent))
        }
        const marketAgents = await market_agent_coll.find({ _id: { $in: lastMarketAgentJourneys.map((item) => ObjectId(item.market_agent)) } }).toArray();
        journeys.market_agents = lastMarketAgentJourneys.map((item) => {
            getNewLocationsBySection(
                item,
                userSection,
                (position, sectionMax) => position * sectionMax
            );
            item.target_position.coordinates[0] -= userSection.long_max / 2;
            item.target_position.coordinates[1] -= userSection.lat_max / 2;
            item.current_position.coordinates[0] -= userSection.long_max / 2;
            item.current_position.coordinates[1] -= userSection.lat_max / 2;
            item.market_agent = marketAgents.find((ma) => ma._id.toString() == item.market_agent)
            return item
        })

    }
    return res.status(201).send(journeys);
}


