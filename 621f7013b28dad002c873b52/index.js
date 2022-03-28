import { database, ObjectId } from "@spica-devkit/database";


const CITY_SYSTEM_BUCKET = process.env.CITY_SYSTEM_BUCKET_ID;
const PRODUCT_BUCKET = process.env.PRODUCT_BUCKET_ID;

let db;

export async function consumptionRatesDashboard(req, res) {
    if (!db) db = await database();
    const city_system_collection = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    const datas = await city_system_collection.find().toArray();
    const product_collection = db.collection(`bucket_${PRODUCT_BUCKET}`);
    const products = await product_collection.find().toArray();
    const cities = [...new Set(datas.map((item) => item.city))]
    const consumptionBarData = [];
    const productionBarData = [];
    products.forEach((product) => {
        let consumptionRateAvarage = 0, productionRateAvarage = 0;
        datas.filter((item) => item.product == product._id.toString()).
            forEach((item) => { consumptionRateAvarage += item.consumption_rate; productionRateAvarage += item.production_rate });
        consumptionBarData.push((consumptionRateAvarage / cities.length).toFixed(3));
        productionBarData.push((productionRateAvarage / cities.length).toFixed(3));
    })
    let test = {
        title: "Rate Avarages",
        "options": { "legend": { "display": true }, "responsive": true },
        "label": products.map((item) => item.title),
        "datasets": [
            { "data": consumptionBarData, "label": "ConsumptionRate" },
            { "data": productionBarData, "label": "Production Rate" },
        ],
        "legend": true,
    }
    return res.status(201).send(test);
}