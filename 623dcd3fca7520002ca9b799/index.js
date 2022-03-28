import { database, ObjectId } from "@spica-devkit/database"
import * as Identity from "@spica-devkit/identity";
import jwt_decode from "jwt-decode";

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


const SHIP_BUCKET = process.env.SHIP_BUCKET_ID;
const USER_BUCKET = process.env.USER_BUCKET_ID;
const ABILITY_BUCKET = process.env.ABILITY_BUCKET_ID;
const SECTION_BUCKET = process.env.SECTION_BUCKET_ID;


let db;

export async function allAbilities(req, res) {

    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");

    let identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");

    if (!db) db = await database();
    const user_col = db.collection(`bucket_${USER_BUCKET}`)
    const ship_col = db.collection(`bucket_${SHIP_BUCKET}`)

    const user = await user_col.findOne(ObjectId(identity.attributes.user_id));
    if (!user.ships || user.ships.length == 0) return res.status(200).send([]);

    const ships = await ship_col.find({ _id: { $in: user.ships.map((item) => ObjectId(item)) } }).toArray();
    const abilities = ships.map((ship) => ship.attributes.map((item) => { item.id = `${ship._id}_${item.ability}`; return item }));

    return res.status(201).send(abilities);
}
export async function usedAbilities(req, res) {

    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");

    let identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");

    if (!db) db = await database();
    const user_col = db.collection(`bucket_${USER_BUCKET}`)
    const ability_col = db.collection(`bucket_${ABILITY_BUCKET}`)
    const section_col = db.collection(`bucket_${SECTION_BUCKET}`);


    const user = await user_col.findOne(ObjectId(identity.attributes.user_id));
    if (!user.ships || user.ships.length == 0) return res.status(200).send([]);
    const user_section = await section_col.findOne(ObjectId(user.location_section));
    const used_abilities = await ability_col.find({ user: user._id.toString(), ship: { $in: user.ships } }).toArray();

    used_abilities.forEach((element) => {
        element.ability = `${element.ship.toString()}_${element.ability}`;
        element.position = getNewPositionBySection(
            element.position,
            user_section,
            (position, sectionMax) => position * sectionMax
        );
        element.position.coordinates[0] -= user_section.long_max / 2;
        element.position.coordinates[1] -= user_section.lat_max / 2;
        delete element.ship
    })
    return res.status(201).send(used_abilities);
}

export async function useAbility(req, res) {

    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");

    let identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");

    if (!db) db = await database();
    const user_col = db.collection(`bucket_${USER_BUCKET}`)
    const ability_col = db.collection(`bucket_${ABILITY_BUCKET}`)
    const section_col = db.collection(`bucket_${SECTION_BUCKET}`);
    const ship_col = db.collection(`bucket_${SHIP_BUCKET}`)

    let { position, id } = req.body;
    const [ship_id, ability] = id.split("_");
    const user = await user_col.findOne(ObjectId(identity.attributes.user_id));
    if (!user.ships || user.ships.length == 0) return res.status(200).send([]);
    if (!user.ships.includes(ship_id)) return res.status(403).send("Ship not yours");


    let lastUsedAbility = await ability_col.find({ user: user._id.toString(), ship: ship_id, ability: ability }).sort({ _id: -1 }).limit(1).toArray();
    let canUseAbility = true;
    if (lastUsedAbility[0]) {
        lastUsedAbility = lastUsedAbility[0]
        const ship = await ship_col.findOne(ObjectId(ship_id));
        const attribute = ship.attributes.find((item) => item.ability == ability);
        const diffUsage = (new Date() - new Date(lastUsedAbility.used_time)) / 1000
        if (attribute.cooldown > diffUsage) canUseAbility = false;
    }
    if (!canUseAbility) return res.status(403).send("Colldown continute");

    const user_section = await section_col.findOne(ObjectId(user.location_section));
    position = {
        "type": "Point",
        "coordinates": [
            position[0] + user_section.long_max / 2,
            position[1] + user_section.lat_max / 2
        ]
    };
    getNewPositionBySection(
        position,
        user_section,
        (positionValue, sectionMax) => positionValue / sectionMax
    );

    await ability_col.insertOne({
        ability,
        user: user._id.toString(),
        position,
        used_time: new Date(),
        ship: ship_id
    })
    return res.status(201).send("ok");
}


// Helper
function getNewPositionBySection(position, section, sectionTransformFunc) {
    position.coordinates[0] = sectionTransformFunc(position.coordinates[0], section.long_max);
    position.coordinates[1] = sectionTransformFunc(position.coordinates[1], section.lat_max);
    return position;
}

// Helper end