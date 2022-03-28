
import { database, ObjectId } from "@spica-devkit/database";

const CITY_BUCKET = process.env.CITY_BUCKET_ID;
const LOCATION_SECTION_BUCKET = process.env.LOCATION_SECTION_BUCKET_ID;
const CONF_BUCKET = process.env.CONF_BUCKET_ID;
const ORDER_BUCKET = process.env.ORDER_BUCKET_ID;
const AGENT_BUCKET = process.env.AGENT_BUCKET_ID;


let db;
export async function setSection(req, res) {
    let { data } = req.body;
    if (!db) db = await database();
    data = JSON.parse(data);
    //set the location section data
    //START

    const location_section_collection = db.collection(`bucket_${LOCATION_SECTION_BUCKET}`);
    const location_section = await location_section_collection.findOne({ id: data.id.toString() }).catch((e) => console.log("e :", e))
        .catch((e) => console.log("error while find location section :", e))
    if (location_section) {
        await location_section_collection.updateOne(
            { _id: ObjectId(location_section._id) },
            {
                $set: { long_max: data.SectionDimensions.x, lat_max: data.SectionDimensions.y }
            }).catch((e) => console.log("error while update location section :", e))
    }
    else {
        await location_section_collection.insertOne({
            id: data.id.toString(), long_max: data.SectionDimensions.x, lat_max: data.SectionDimensions.y
        }).catch((e) => console.log("error while update location section :", e))
    }
    //END

    // set the positions of cities 
    // START

    const cityPromises = [];
    const city_collection = db.collection(`bucket_${CITY_BUCKET}`);
    if (data.Citiees) {
        data.Cities.forEach((city) => {
            city.position = {
                "type": "Point",
                "coordinates": [
                    city.Position.x + data.SectionDimensions.x / 2,
                    city.Position.y + data.SectionDimensions.y / 2
                ]
            };
            getNewLocationsBySection(
                city,
                data.SectionDimensions,
                (position, sectionMax) => position / sectionMax
            );
            cityPromises.push(
                city_collection.updateOne(
                    { _id: ObjectId(city.Id) },
                    {
                        $set: { position: city.position, "location_section": location_section._id }
                    }).catch((e) => console.log("error while update location section :", e))
            )
        })
        await Promise.all(cityPromises)
    }
    //END

    //add to conf bucket grid data
    //START
    const conf_collection = db.collection(`bucket_${CONF_BUCKET}`);
    const existMap = await conf_collection.findOne({ key: "map_" + data.id.toString() })
    if (existMap) {
        await conf_collection.updateOne(
            { _id: ObjectId(existMap._id) },
            {
                $set: {
                    value: JSON.stringify({
                        id: data.id.toString(),
                        section_dimensions: { long_max: data.SectionDimensions.x, lat_max: data.SectionDimensions.y },
                        grid_dimensions: { long_max: data.GridDimensions.x, lat_max: data.GridDimensions.y },
                        graph: data.GridGraph.map((item) => item.columns)
                    })
                }
            }).catch((e) => console.log("error while update map conf :", e))
    }
    else {
        await conf_collection.insertOne(
            {
                key: "map_" + data.id.toString(),
                value: JSON.stringify({
                    id: data.id.toString(),
                    section_dimensions: { long_max: data.SectionDimensions.x, lat_max: data.SectionDimensions.y },
                    grid_dimensions: { long_max: data.GridDimensions.x, lat_max: data.GridDimensions.y },
                    graph: data.GridGraph.map((item) => item.columns)
                })

            }).catch((e) => console.log("error while insert map conf :", e))
    }


    //END

    return res.status(201).send("ok");
}

function getNewLocationsBySection(city, section, sectionTransformFunc) {
    city.position.coordinates[0] = sectionTransformFunc(city.position.coordinates[0], section.x);
    city.position.coordinates[1] = sectionTransformFunc(city.position.coordinates[1], section.y);
    return city;
}


export async function distributeMoneyByAgents() {
    if (!db) db = await database();
    const agent_col = db.collection(`bucket_${AGENT_BUCKET}`);
    const order_col = db.collection(`bucket_${ORDER_BUCKET}`);

    const oneMinAgo = new Date();
    oneMinAgo.setMinutes(oneMinAgo.getMinutes() - 30);

    let totalOrderPrice = 0;
    let cityOrderPrices = [];
    const orders = await order_col.find({ created_at: { $gt: oneMinAgo }, status: 1 }).toArray();
    orders.forEach((order) => {
        totalOrderPrice += order.price;
        cityOrderPrices[order.city.toString()] = cityOrderPrices[order.city.toString()] || 0
        cityOrderPrices[order.city.toString()] += order.price
    });

    let cities = [...new Set(orders.map((item) => item.city))];

    for (const city of cities) {

        const citySharePrice = (cityOrderPrices[city.toString()] / totalOrderPrice) * 20.8 // 30000 wisl per day
        let totalAgentPower = 0;
        const agents = await agent_col.find({ city: city.toString() }).toArray();
        agents.forEach((agent) => { totalAgentPower += agent.power });

        for (const agent of agents) {
            const earnedPrice = (agent.power / totalAgentPower) * citySharePrice
            await agent_col.updateOne({ _id: ObjectId(agent._id) }, { $inc: { collectable_wisl: earnedPrice } })
        }

    }
    return true
}
