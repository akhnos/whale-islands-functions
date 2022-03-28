import { database, ObjectId } from "@spica-devkit/database";

let db;
const WISLGiveaway = -30000;

const INSTANT_EVENT_BUCKET = process.env.INSTANT_EVENT_BUCKET_ID;
const CONFIG_BUCKET_ID = process.env.CONFIG_BUCKET_ID;

export async function createInstantEvent(req, res) {
	if (!db) db = await database();
	const instant_event_col = db.collection(`bucket_${INSTANT_EVENT_BUCKET}`);
	const config_col = db.collection(`bucket_${CONFIG_BUCKET_ID}`);

    await instant_event_col.remove();
	let current_balance = await config_col.findOne({key: "current_order_balance"}).catch(console.log);
	let currentBalance = JSON.parse(current_balance.value).balance;
	let now = new Date();
	let minutesToDay = (24 - (now.getHours() + 1)) * 60 + (60 - now.getMinutes());
    let balanceShouldBe = WISLGiveaway * ((1440 - minutesToDay) / 1440)
    let probability = Math.round(Math.log10(Math.abs(balanceShouldBe - currentBalance)));
    const instantEvents = ["storm","pirates","earthquake","treasure"]
    for(let i = 0; i < probability; i++){
        let randomTime = Math.ceil(Math.random() * 59);
        now.setMinutes(randomTime);
        let event = instantEvents[Math.floor(Math.random() * instantEvents.length)];
        let randomX = Math.random()
        let randomY = Math.random()
        await instant_event_col.insert({date: now, position:{type: "Point", coordinates:[randomY,randomX]}, event}).catch(console.log);
        
    }
	return res.status(201).send("Spica is awesome!");
}