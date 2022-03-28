import { database } from "@spica-devkit/database";

const MARKET_AGENT_BUCKET = process.env.MARKET_AGENT_BUCKET_ID;
const AUCTION_BUCKET = process.env.AUCTION_BUCKET_ID;
const SHIP_BUCKET = process.env.SHIP_BUCKET_ID;

const abilityCountChances = [0,60,80,95,100];
const allAbilities = ["meteorologist", "scuba_diver", "drone_pilot", "seismograph"];

let db;

export async function generateShips() {
    if (!db) db = await database();
    const ship_col = db.collection(`bucket_${SHIP_BUCKET}`);
    const merchant_collection = db.collection(`bucket_${MARKET_AGENT_BUCKET}`);
    let lastAgent = await merchant_collection.find().sort({ nft_id: -1 }).limit(1).toArray().catch(console.log);
    let nft_id = lastAgent.length ? lastAgent[0].nft_id : 0;

    let ship = await ship_col.find().sort({ nft_id: -1 }).limit(1).toArray().catch(console.log);
    let lastShipNFDId = ship.length ? ship[0].nft_id : 0;

    lastShipNFDId = lastShipNFDId > nft_id ? lastShipNFDId : nft_id;
    let ships = [];

    let shipCount = 10;
    for (let i = 0; i < shipCount; i++) {
        lastShipNFDId++;
        let storage = (Math.ceil(Math.random() * 80) * 10) + 200;
        let speed = Math.ceil(Math.random() * 80) + 20;
        let attributeCount = chooseAbilityCount();
        let attributes = chooseAbility(attributeCount);

        ships.push({
            title: `Ship#${lastShipNFDId}`,
            storage: storage,
            speed: speed,
            attributes: attributes,
            nft_id: lastShipNFDId
        });
    }
    await ship_col.insertMany(ships).catch(console.log);
    return `${shipCount} ship has been generated. The last ID is ${lastShipNFDId}`;
}

function chooseAbilityCount(){
    let random = Math.random() * 100;
    let count = 0;
    for(let i = 1; i < abilityCountChances.length; i++){
        if(abilityCountChances[i-1] < random && abilityCountChances[i] > random){
            count = i;
        }
    }
    return count;
}

function chooseAbility(abilityCount) {
    let abilities = [...allAbilities];
    let attributes = [];
    for (let j = 0; j < abilityCount; j++) {
        let random = Math.floor(Math.random() * abilities.length);
        let fMin = Math.ceil(Math.log10(Math.random() * 100000) * 20);
        let fDuration = Math.ceil(Math.log10(Math.random() * 1000) * 20);
        let area = Math.ceil(Math.log10(Math.random() * 100000) * 10);
        let cooldown = Math.ceil(Math.log10(Math.random() * 100000) * 60);
        attributes.push({
            ability: abilities[random],
            forecast_min: fMin,
            forecast_max: fMin + fDuration,
            area: area,
            cooldown: cooldown
        });
        abilities.splice(random, 1);
    }
    return attributes;
}

export async function exportShip(req, res) {
    if (!db) db = await database();
    const ship_col = db.collection(`bucket_${SHIP_BUCKET}`);
    let ships = await ship_col.find().toArray().catch(console.log);
    let shipJsons = [];
    for (let i = 0; i < ships.length; i++) {
        let ship = ships[i];
        let attributes = [];
        ship.attributes.forEach((a, i) => {
            attributes.push({ "trait_type": `attributes_${i}`, "value": a.ability })
            attributes.push({ "trait_type": `attributes_${i}_cooldown`, "value": a.cooldown })
            attributes.push({ "trait_type": `attributes_${i}_forecast_min`, "value": a.forecast_min })
            attributes.push({ "trait_type": `attributes_${i}_forecast_max`, "value": a.forecast_max })
            attributes.push({ "trait_type": `attributes_${i}_area`, "value": a.area })
        });
        attributes.push({ "trait_type": `storage`, "value": ship.storage });
        attributes.push({ "trait_type": `speed`, "value": ship.speed });
        shipJsons.push(
            {
                "name": ship.title,
                "description": `${ship.title} in Whale Islands`,
                "image": `${ship.nft_id}.jpg`,
                "external_url": "https://whaleislands.com",
                "attributes": attributes,
            })
    }
    res.headers.set(
        "Content-Disposition",
        "attachment; filename=download-" + Date.now() + ".zip"
    );
    res.headers.set("Content-Type", "application/octet-stream");
    return res.status(200).send(exportJson(shipJsons));
}

export async function generateMerchant(req, res) {
    if (!db) db = await database();

    const ship_col = db.collection(`bucket_${SHIP_BUCKET}`);
    const merchant_collection = db.collection(`bucket_${MARKET_AGENT_BUCKET}`);

    let lastAgent = await merchant_collection.find().sort({ nft_id: -1 }).limit(1).toArray().catch(console.log);
    let nft_id = lastAgent.length ? lastAgent[0].nft_id : 0;

    let ship = await ship_col.find().sort({ nft_id: -1 }).limit(1).toArray().catch(console.log);
    let lastShipNFDId = ship.length ? ship[0].nft_id : 0;

    nft_id = lastShipNFDId > nft_id ? lastShipNFDId : nft_id;

    const generatedMerchants = [];
    const count = 10;
    for (let x = 0; x < count; x++) {
        nft_id++;
        let speed = Math.round(Math.max(getBaseLog(5, Math.floor(Math.random() * 100)), 1) * 5);
        let power = Math.round(Math.max(getBaseLog(5, Math.floor(Math.random() * 100)), 1) * 5);
        let network = Math.round(Math.max(getBaseLog(5, Math.floor(Math.random() * 100)), 1) * 5);
        let safe = Math.round(Math.max(getBaseLog(5, Math.floor(Math.random() * 100)), 1) * 5) * 10;
        generatedMerchants.push({
            nft_id,
            speed,
            power,
            network,
            safe
        })
    }

    await merchant_collection.insertMany(generatedMerchants.map((item) => item)).catch((e) => console.log("error generatedMerchants:", e))
    return res.status(201).send(generatedMerchants);
}

function getBaseLog(x, y) {
    return Math.log(y) / Math.log(x);
}

export async function exportMerchants(req, res) {
    const { skip = 0, limit = 10 } = req.query;
    if (!db) db = await database();
    const merchant_collection = db.collection(`bucket_${MARKET_AGENT_BUCKET}`);
    const merchants = await merchant_collection.find().skip(Number(skip)).limit(Number(limit)).toArray()
    let jsons = [];
    merchants.forEach((item) => {
        jsons.push({
            "name": `Agent#${item.nft_id}`,
            "description": `Agent#${item.nft_id} in Whale Islands`,
            "image": `${item.nft_id}.jpg`,
            "external_url": "https://whaleislands.com",
            "attributes": [
                { "trait_type": "speed", "value": item.speed },
                { "trait_type": "power", "value": item.power },
                { "trait_type": "network", "value": item.network },
                { "trait_type": "safe", "value": item.safe },
            ],
        })
    });

    res.headers.set(
        "Content-Disposition",
        "attachment; filename=download-" + Date.now() + ".zip"
    );
    res.headers.set("Content-Type", "application/octet-stream");
    return res.status(200).send(exportJson(jsons));
}

function exportJson(json) {
    const admz = require("adm-zip");
    const zp = new admz();
    for (let i = 0; i < json.length; i++) {
        let jsonFormat = JSON.stringify(json[i]);
        zp.addFile(
            json[i].name.split("#")[1] + ".json",
            Buffer.alloc(jsonFormat.length, jsonFormat),
            "entry comment goes here"
        );
    }
    return zp.toBuffer();
}