import { database, ObjectId } from "@spica-devkit/database";
const NEWS_BUCKET = process.env.NEWS_BUCKET_ID;
const COUNTRY_BUCKET = process.env.COUNTRY_BUCKET_ID;
const USER_PRODUCT_BUCKET = process.env.USER_PRODUCT_BUCKET_ID;
const PRODUCT_BUCKET = process.env.PRODUCT_BUCKET_ID;

let db;
export async function warUpdate(change) {
    if (!change.current.in_war && change.previous.in_war != change.current.in_war) {
        if (!db) db = await database();
        let country_collection = db.collection(`bucket_${COUNTRY_BUCKET}`);
        let countries = await country_collection.find({ _id: { $in: change.current.left_sides.concat(change.current.right_sides).map((item) => ObjectId(item)) } }).toArray()
        addNews(
            {
                title:
                    `The war between ${countries.filter((country) => change.current.left_sides.includes(country._id.toString())).map((item) => item.title)} and ${countries.filter((country) => change.current.right_sides.includes(country._id.toString())).map((item) => item.title)} is over.`,
                description: "", subject: "war", for_subscribers: true
            });
    }
}
export async function agreementUpdate(change) {
    console.log("change :", change)
    if (!change.current.in_agreement && change.previous.in_agreement != change.current.in_agreement) {
        if (!db) db = await database();
        let country_collection = db.collection(`bucket_${COUNTRY_BUCKET}`);
        let countries = await country_collection.find({ _id: { $in: [ObjectId(change.current.contracted_country), ObjectId(change.current.contracting_country)] } }).toArray();
        console.log("countries :", countries)
        addNews(
            {
                title:
                    `The agreement between ${countries.filter((country) => change.current.contracted_country == country._id.toString())[0].title} and  ${countries.filter((country) => change.current.contracting_country == country._id.toString())[0].title} is over.`,
                description: "", subject: "agreement", for_subscribers: true
            });
    }
}
export async function embargoUpdate(change) {
    if (!change.current.in_embargo && change.previous.in_embargo != change.current.in_embargo) {
        if (!db) db = await database();
        let country_collection = db.collection(`bucket_${COUNTRY_BUCKET}`);
        let countries = await country_collection.find({ _id: { $in: [ObjectId(change.current.embargoed_country), ObjectId(change.current.embargoing_country)] } }).toArray();
        console.log("countries :", countries)
        addNews(
            {
                title:
                    `The embargo between ${countries.filter((country) => change.current.embargoed_country == country._id.toString())[0].title} and  ${countries.filter((country) => change.current.embargoing_country == country._id.toString())[0].title} is over.`,
                description: "", subject: "embargo", for_subscribers: true
            });
    }
}


async function addNews(data) {
    if (!db) db = await database();
    const news_collection = db.collection(`bucket_${NEWS_BUCKET}`);
    await news_collection.insertOne(data)
}
export async function userInsert(change) {
    if (!db) db = await database();
    const product_collection = db.collection(`bucket_${PRODUCT_BUCKET}`);
    const user_product_collection = db.collection(`bucket_${USER_PRODUCT_BUCKET}`);
    const products = await product_collection.find().toArray();
    await user_product_collection.insertMany(products.map((item => {
        return { user: change.documentKey.toString(), product: item._id.toString(), amount: 0, updated_at: new Date() }
    })));
    return;
}



