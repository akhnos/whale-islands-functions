import { database, ObjectId } from "@spica-devkit/database";

const CITY_SYSTEM_BUCKET = process.env.CITY_SYSTEM_BUCKET_ID;
const CITY_BUCKET = process.env.CITY_BUCKET_ID;
const WAR_BUCKET = process.env.WAR_BUCKET_ID;
const AGREEMENT_BUCKET = process.env.AGREEMENT_BUCKET_ID;
const EMBARGO_BUCKET = process.env.EMBARGO_BUCKET_ID;
const PRODUCT_BUCKET = process.env.PRODUCT_BUCKET_ID;
const COUNTRY_RELATION_BUCKET = process.env.COUNTRY_RELATION_BUCKET_ID;
const NEWS_BUCKET = process.env.NEWS_BUCKET_ID;
const COUNTRY_BUCKET = process.env.COUNTRY_BUCKET_ID;


let db;
const checkDigits = (element) => element.toString().split(".")[1] ? Number(Number(element).toFixed(3)) : Number(element);

export default async function () {
    // export default async function () {
    if (!db) db = await database()
    const city_system_collection = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    const city_collection = db.collection(`bucket_${CITY_BUCKET}`);
    const data = await city_system_collection.find({ count: { $gt: 0 } }).toArray();
    const uniqueCitiesForSearc = Array.from(new Set(data.map((item) => item.city)))
    const cities = await city_collection.find({
        _id: { $in: uniqueCitiesForSearc.map((item) => ObjectId(item)) }
    }).toArray();
    const promises = [];
    data.forEach((item) => {
        const city = cities.find((city) => city._id.toString() == item.city);
        item.count += ((city.population * item.production_rate) - (city.population * item.consumption_rate)) / 1000;
        promises.push(
            city_system_collection.updateOne(
                { _id: ObjectId(item._id.toString()) },
                {
                    $set: {
                        "count": item.count > 1 ? item.count > item.storage ? item.storage : Math.floor(checkDigits(item.count)) : 1,
                    }
                }
            ).catch((e) => console.log("default function error :", e)))
    })
    await Promise.all(promises).catch((e) => console.log("error :", e))
    //these will be to triggered
    await Promise.all([checkWar(), checkAgreement(), checkEmbargo()])
    await checkRelations()
    //
    return {}

}
async function checkWar() {
    if (!db) db = await database()
    let city_system_collection = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    let war_collection = db.collection(`bucket_${WAR_BUCKET}`);
    let city_collection = db.collection(`bucket_${CITY_BUCKET}`);

    let wars = await war_collection.find({ in_war: true }).toArray();
    let promises = [];
    for (const war of wars) {
        let cities = await city_collection.find({ country: { $in: [war.left_side, war.right_side] } }).toArray(); //one query
        let data = await city_system_collection.find({ city: { $in: cities.map((item) => item._id.toString()) } }).toArray();

        let leftSideCitiesData = data.filter((item) => cities.filter((item) => war.left_side == item.country)
            .some((item2) => item.city == item2._id.toString()));
        let rightSideCitiesData = data.filter((item) => cities.filter((item) => war.right_side == item.country).some((item2) => item.city == item2._id.toString()))

        leftSideCitiesData.forEach((data) => {
            data.production_rate -= data.production_rate * war.left_side_production_reduction_rate;
            promises.push(city_system_collection.updateOne(
                { _id: ObjectId(data._id) },
                { $set: { "production_rate": data.production_rate > 0 ? checkDigits(data.production_rate) : 0 } }
            ))
        })
        rightSideCitiesData.forEach((data) => {
            data.production_rate -= data.production_rate * war.right_side_production_reduction_rate;
            promises.push(city_system_collection.updateOne(
                { _id: ObjectId(data._id) },
                { $set: { "production_rate": data.production_rate > 0 ? checkDigits(data.production_rate) : 0 } }
            ).catch((e) => console.log("checkWar function error :", e)))
        })
    }
    return Promise.all(promises).then((res) => console.log("checkWar function res :", res));
}
async function checkAgreement() {
    if (!db) db = await database()
    let city_system_collection = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    let agreement_collection = db.collection(`bucket_${AGREEMENT_BUCKET}`);
    let city_collection = db.collection(`bucket_${CITY_BUCKET}`);
    let agreements = await agreement_collection.find({ in_agreement: true }).toArray();
    let promises = [];
    for (const agreement of agreements) {
        let cities = await city_collection.find({ country: { $in: [agreement.contracted_country, agreement.contracting_country] } }).toArray(); //one query
        let data = await city_system_collection.find({ city: { $in: cities.map((item) => item._id.toString()) } }).toArray();
        let contractedCitiesData = data.filter((item) => cities.filter((item) => agreement.contracted_country == item.country).some((item2) => item.city == item2._id.toString()));
        let contractingCitiesData = data.filter((item) => cities.filter((item) => agreement.contracting_country == item.country).some((item2) => item.city == item2._id.toString()))
        contractedCitiesData.forEach((data) => {
            data.production_rate = Number(data.production_rate);
            data.production_rate -= data.production_rate * Number(agreement.agreement_rating);
            promises.push(city_system_collection.updateOne(
                { _id: ObjectId(data._id) },
                { $set: { "production_rate": data.production_rate > 0 ? checkDigits(data.production_rate) : 0 } }
            ).catch((e) => console.log("checkAgreement function error :", e)))
        });
        contractingCitiesData.forEach((data) => {
            data.production_rate = Number(data.production_rate);
            data.production_rate += data.production_rate * Number(agreement.agreement_rating);
            promises.push(city_system_collection.updateOne(
                { _id: ObjectId(data._id) },
                { $set: { "production_rate": data.production_rate > 0 ? checkDigits(data.production_rate) : 0 } }
            ))
        })
    }
    return Promise.all(promises).then((res) => console.log("checkAgreement function res :", res))
}

async function checkEmbargo() {
    if (!db) db = await database()
    const city_system_collection = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    const embargo_collection = db.collection(`bucket_${EMBARGO_BUCKET}`);
    const city_collection = db.collection(`bucket_${CITY_BUCKET}`);
    const embargos = await embargo_collection.find({ in_embargo: true }).toArray();
    const promises = [];

    for (const embargo of embargos) {
        const cities = await city_collection.find({ country: embargo.embargoed_country }).toArray(); //one query
        const data = await city_system_collection.find({ $and: [{ city: { $in: cities.map((item) => item._id.toString()) } }, { product: { $in: embargo.products } }] }).toArray();
        data.forEach((item) => {
            item.consumption_rate = Number(item.consumption_rate);
            if (item.consumption_rate > 0) item.consumption_rate -= item.consumption_rate * embargo.consumption_rate_decrease;
            if (item.count > 0) item.count -= item.count * embargo.deleted_product_rate;
            promises.push(city_system_collection.updateOne(
                { _id: ObjectId(item._id) },
                {
                    $set: {
                        "consumption_rate": item.consumption_rate > 0 ? checkDigits(item.consumption_rate) : 0,
                        "count": item.count > 0 ? Math.floor(checkDigits(item.count)) : 0
                    }
                }
            ).catch((e) => console.log("checkEmbargo function error :", e)))
        })
    }
    return Promise.all(promises).then((res) => console.log("checkEmbargo function es :", res)).catch((e) => console.log("checkEmbargo function error :", e))
}
async function checkRelations() {
    if (!db) db = await database();
    const country_rel_col = await db.collection(`bucket_${COUNTRY_RELATION_BUCKET}`);
    const relations = await country_rel_col.find().toArray();
    const promises = []
    for (let item of relations) {
        let relValue = Number(item.relation_value);
        let shaping_value = 100 - Math.abs(relValue);
        shaping_value = (shaping_value * 10) / 100; //%10 
        if (item.in_increase) {
            relValue += shaping_value
            promises.push(country_rel_col.updateOne({ _id: ObjectId(item._id) }, { $set: { relation_value: Number(relValue.toFixed(3)) } }).catch((e) => console.log("error :", e)))
        }
        if (item.in_decrease) {
            relValue -= shaping_value
            promises.push(country_rel_col.updateOne({ _id: ObjectId(item._id) }, { $set: { relation_value: Number(relValue.toFixed(3)) } }).catch((e) => console.log("error :", e)))
        }
        const min_possibility = 5;
        const possibility_range = 50;

        const getRandomValue = (value) => {
            return Math.floor(Math.random() * (1000 - value + 1)) + (min_possibility + value);
        }

        if (relValue < -possibility_range) {
            const randomValue = getRandomValue(Math.floor(Math.abs(relValue) - possibility_range))
            if (randomValue == possibility_range + min_possibility) {
                console.log("-----CREATE WAR------")
                await createEvent(item.country1.toString(), item.country2.toString(), 'war');
            }
        }
        else if (relValue < 0) {
            await checkAndCloseWar(item.country1.toString(), item.country2.toString());
            const randomValue = getRandomValue(Math.floor(Math.abs(relValue)))
            if (randomValue == possibility_range + min_possibility) {
                console.log("-----CREATE EMBARGO------")
                await createEvent(item.country1.toString(), item.country2.toString(), 'embargo');
            }
        }
        else if (relValue < 50) {
            await checkAndCloseEmbargo(item.country1.toString(), item.country2.toString());
            await checkAndCloseAgreement(item.country1.toString(), item.country2.toString());
            await checkAndCloseWar(item.country1.toString(), item.country2.toString());
        }
        else if (relValue <= 100 && relValue > 50) {
            const randomValue = getRandomValue(Math.floor(relValue - possibility_range)) //rel value is negative
            if (randomValue == possibility_range + min_possibility) {
                console.log("-----CREATE AGREEMENT------")
                await createEvent(item.country1, item.country2, 'agreement');
            }
        }

    }
    await Promise.all(promises)
    return { relations }
}




const checkAndCloseAgreement = async (country1, country2) => {
    if (!db) db = await database();
    const agreement_col = db.collection(`bucket_${AGREEMENT_BUCKET}`)
    const country_col = db.collection(`bucket_${COUNTRY_BUCKET}`)
    const existAgreement = await agreement_col.findOne({
        $or: [
            { contracted_country: country1, contracting_country: country2 },
            { contracting_country: country1, contracted_country: country2 }]
    });
    if (existAgreement) {
        await agreement_col.updateOne({ _id: ObjectId(existAgreement._id) }, { $set: { in_agreement: false } })
        const countries = await country_col.find({ _id: { $in: [ObjectId(country1), ObjectId(country2)] } }).toArray();
        country1 = countries.find((country) => country._id.toString() == country1);
        country2 = countries.find((country) => country._id.toString() == country2);
        await addNews(
            {
                title: `Agreement between ${country1.title} and ${country2.title} is over`, subject: "war", for_subscribers: true
            });
    }
}

const checkAndCloseWar = async (country1, country2) => {
    if (!db) db = await database();
    const war_col = db.collection(`bucket_${WAR_BUCKET}`)
    const country_col = db.collection(`bucket_${COUNTRY_BUCKET}`)
    const existWar = await await war_col.findOne({
        $or: [
            { left_side: country1, right_side: country2 },
            { right_side: country1, left_side: country2 }]
    });
    if (existWar) {
        await war_col.updateOne({ _id: ObjectId(existWar._id) }, { $set: { in_war: false } })
        const countries = await country_col.find({ _id: { $in: [ObjectId(country1), ObjectId(country2)] } }).toArray();
        country1 = countries.find((country) => country._id.toString() == country1);
        country2 = countries.find((country) => country._id.toString() == country2);
        await addNews(
            {
                title: `War between ${country1.title} and ${country2.title} is over`, subject: "war", for_subscribers: true
            });
    }
}
const checkAndCloseEmbargo = async (country1, country2) => {
    if (!db) db = await database();
    const embargo_col = db.collection(`bucket_${EMBARGO_BUCKET}`);
    const country_col = db.collection(`bucket_${COUNTRY_BUCKET}`)
    const existEmbargo = await embargo_col.findOne({
        $or: [
            { embargoed_country: country1, embargoing_country: country2 },
            { embargoing_country: country1, embargoed_country: country2 }]
    });
    if (existEmbargo) {
        await embargo_col.updateOne({ _id: ObjectId(existEmbargo._id) }, { $set: { in_embargo: false } });
        const countries = await country_col.find({ _id: { $in: [ObjectId(country1), ObjectId(country2)] } }).toArray();
        country1 = countries.find((country) => country._id.toString() == country1);
        country2 = countries.find((country) => country._id.toString() == country2);
        await addNews(
            {
                title: `Embargo between ${country1.title} and ${country2.title} is over`, subject: "war", for_subscribers: true
            });
    }
}
const createEvent = async (country1, country2, event) => {
    if (!db) db = await database();
    const embargo_col = db.collection(`bucket_${EMBARGO_BUCKET}`);
    const war_col = db.collection(`bucket_${WAR_BUCKET}`);
    const agreement_col = db.collection(`bucket_${AGREEMENT_BUCKET}`)
    const country_col = db.collection(`bucket_${COUNTRY_BUCKET}`)
    const product_col = db.collection(`bucket_${PRODUCT_BUCKET}`);
    const countries = await country_col.find({ _id: { $in: [ObjectId(country1), ObjectId(country2)] } }).toArray();
    country1 = countries.find((country) => country._id.toString() == country1);
    country2 = countries.find((country) => country._id.toString() == country2)
    switch (event) {
        case "war":
            const existWar = await war_col.findOne({
                $or: [
                    { left_side: country1._id.toString(), right_side: country2._id.toString() },
                    { right_side: country1._id.toString(), left_side: country2._id.toString() }]
            });
            if (existWar) return
            await war_col.insertOne({
                left_side: country1._id.toString(),
                right_side: country2._id.toString(),
                in_war: true,
                left_side_production_reduction_rate: Number(Math.random().toFixed(3)),
                right_side_production_reduction_rate: Number(Math.random().toFixed(3))
            })
            await addNews(
                {
                    title:
                        `${country1.title} entered the war with ${country2.title}.`, subject: "war", for_subscribers: true
                });
            break;
        case "embargo":
            const existEmbargo = await embargo_col.findOne({
                $or: [
                    { embargoed_country: country1._id.toString(), embargoing_country: country2._id.toString() },
                    { embargoing_country: country1._id.toString(), embargoed_country: country2._id.toString() }]
            });
            if (existEmbargo) return
            const randomProductsCountValue = Math.floor((Math.random() * 10) + 1);
            let embargoedProductCount = 0
            if (randomProductsCountValue >= 9)  // %10 3 product will be in embargo
                embargoedProductCount = 3
            else if (randomProductsCountValue >= 6) // %30 2 product will be in embargo
                embargoedProductCount = 2
            else  // %60 1 product will be in embargo
                embargoedProductCount = 1
            const embargoedProducts = await product_col.find({}).sort({ base_price: -1 }).limit(embargoedProductCount).toArray();
            await embargo_col.insertOne({
                embargoed_country: country1._id.toString(),
                embargoing_country: country2._id.toString(),
                in_embargo: true,
                deleted_product_rate: Number(Math.random().toFixed(3)),
                consumption_rate_decrease: Number(Math.random().toFixed(3)),
                products: embargoedProducts.map((item) => item._id.toString())
            })
            await addNews(
                {
                    title:
                        `${country1.title} entered the embargo with ${country2.title}.`,
                    description: "", subject: "embargo", for_subscribers: true
                });
            break;
        case "agreement":

            const existAgreement = await agreement_col.findOne({
                $or: [
                    { contracted_country: country1._id.toString(), contracting_country: country2._id.toString() },
                    { contracting_country: country1._id.toString(), contracted_country: country2._id.toString() }]
            });
            if (existAgreement) return

            const agreementProducts = await product_col.find({}).sort({ base_price: -1 }).limit(1).toArray();
            await agreement_col.insertOne({
                contracted_country: country1._id.toString(),
                contracting_country: country2._id.toString(),
                in_agreement: true,
                agreement_rating: Number(Math.random().toFixed(3)),
                product: agreementProducts[0]._id.toString()
            })
            await addNews(
                {
                    title:
                        `${country1.title} entered the agreement with ${country2.title}.`, subject: "agreement", for_subscribers: true
                });
            break;
    }
}

async function addNews(data) {
    if (!db) db = await database();
    let news_collection = db.collection(`bucket_${NEWS_BUCKET}`);
    await news_collection.insertOne({ ...data, created_at: new Date() })
}
