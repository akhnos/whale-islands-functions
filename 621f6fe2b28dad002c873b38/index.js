import { database, ObjectId } from "@spica-devkit/database";

const CITY_BUCKET = process.env.CITY_BUCKET_ID;
const COUNTRY_BUCKET = process.env.COUNTRY_BUCKET_ID;
const PRODUCT_BUCKET = process.env.PRODUCT_BUCKET_ID;
const CITY_SYSTEM_BUCKET = process.env.CITY_SYSTEM_BUCKET_ID;
const WAR_BUCKET = process.env.WAR_BUCKET_ID;
const AGREEMENT_BUCKET = process.env.AGREEMENT_BUCKET_ID;
const EMBARGO_BUCKET = process.env.EMBARGO_BUCKET_ID;
const NEWS_BUCKET = process.env.NEWS_BUCKET_ID;
const USER_PRODUCT_BUCKET = process.env.USER_PRODUCT_BUCKET_ID;
const USER_BUCKET = process.env.USER_BUCKET_ID;
const PUBLIC_URL = process.env.__INTERNAL__SPICA__PUBLIC_URL__;

let db;
const checkDigits = (element) => element.toString().split(".")[1] ? Number(element.toFixed(3)) : Number(element);
const getRandomArbitrary = (min, max) => {
    return checkDigits(Math.random() * (max - min) + min);
}
const checkNumber = (value) => Number(value) ? Number(value) : value;
const clearString = (value) => value.split("*")[1] || value.split("*")[0];
export async function addCityDashboard() {
    if (!db) db = await database()
    let country_collection = db.collection(`bucket_${COUNTRY_BUCKET}`);
    let countries = await country_collection.find().toArray();
    return {
        title: "Add City",
        description:
            "Fill in all fields to automate processes ",
        inputs: [
            {
                key: "title",
                type: "string",
                value: "",
                title: "Names",
            },
            {
                key: "country",
                type: "multiselect",
                items: {
                    type: "string",
                    enum: countries.map((item) => item.title + '*' + item._id),
                },
                value: "",
                title: "Country",
                maxItems: 1
            },
            {
                key: "population",
                type: "number",
                value: null,
                title: "Population Min",
            },
            {
                key: "population",
                type: "number",
                value: null,
                title: "Population Max",
            },
            {
                key: "consumption_rate",
                type: "number",
                value: null,
                title: "Consumption Rate Min",
            },
            {
                key: "consumption_rate",
                type: "number",
                value: null,
                title: "Consumption Rate Max",
            },
            {
                key: "production_rate",
                type: "number",
                value: null,
                title: "Production Rate Min",
            },
            {
                key: "production_rate",
                type: "number",
                value: null,
                title: "Production Rate Max",
            },
            {
                key: "storage",
                type: "number",
                value: null,
                title: "Storage Range Min",
            },
            {
                key: "storage",
                type: "number",
                value: null,
                title: "Storage Range Max",
            },
        ],
        button: {
            color: "primary",
            target: `${PUBLIC_URL}/fn-execute/createCityFromDashboard`,
            method: "post",
            title: "Create City",
        },
    };
}
export async function createCityFromDashboard(req, res) {
    if (!db) db = await database()
    const city_collection = db.collection(`bucket_${CITY_BUCKET}`);
    const city_system_collection = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    const product_collection = db.collection(`bucket_${PRODUCT_BUCKET}`);
    const products = await product_collection.find().toArray();

    const country = clearString(req.body['country'])
    let obj = {};
    const citySystems = [];
    for (const city of req.body.title.split(",")) {
        const newCity = await city_collection.insertOne({
            title: city,
            country: country,
            population: Math.floor(getRandomArbitrary(Number(req.body.population[0]), Number(req.body.population[1])))
        }).catch((e) => console.log("error :", e));
        if (products.length > 0)
            products.forEach((product) => {
                obj['city'] = newCity.insertedId.toString();
                obj['product'] = product._id.toString();
                obj['storage'] = Math.round(Math.floor(getRandomArbitrary(Number(req.body.storage[0]), Number(req.body.storage[1]))) / 1000) * 1000;
                obj['consumption_rate'] = getRandomArbitrary(Number(req.body.consumption_rate[0]), Number(req.body.consumption_rate[1]))
                obj['production_rate'] = getRandomArbitrary(Number(req.body.production_rate[0]), Number(req.body.production_rate[1]))
                obj['count'] = Math.floor(obj['storage'] * getRandomArbitrary(0.6, 0.8));
                const { sale_price, purchase_price } = getChangedPrices(obj["count"], obj["storage"], product.base_price);
                obj["sale_price"] = checkDigits(sale_price);
                obj["purchase_price"] = checkDigits(purchase_price)
                citySystems.push(obj);
                obj = {};
            })

    }
    await city_system_collection.insertMany(citySystems);
    return { message: "Ok" }
}


export async function addProductDashboard() {

    if (!db) db = await database()
    return {
        title: "Add Product",
        description:
            "Fill in all fields to automate processes ",
        inputs: [
            {
                key: "title",
                type: "string",
                value: "",
                title: "Names",
            },
            {
                key: "description",
                type: "string",
                value: "",
                title: "Description",
            },
            {
                key: "base_price",
                type: "number",
                value: null,
                title: "Base Price Min",
            },
            {
                key: "base_price",
                type: "number",
                value: null,
                title: "Base Price Max",
            },
            {
                key: "consumption_rate",
                type: "number",
                value: null,
                title: "Consumption Rate Min",
            },
            {
                key: "consumption_rate",
                type: "number",
                value: null,
                title: "Consumption Rate Max",
            },
            {
                key: "production_rate",
                type: "number",
                value: null,
                title: "Production Rate Min",
            },
            {
                key: "production_rate",
                type: "number",
                value: null,
                title: "Production Rate Max",
            },
            {
                key: "storage",
                type: "number",
                value: null,
                title: "Storage Range Min",
            },
            {
                key: "storage",
                type: "number",
                value: null,
                title: "Storage Range Max",
            },
        ],
        button: {
            color: "primary",
            target: `${PUBLIC_URL}/fn-execute/createProductFromDashboard`,
            method: "post",
            title: "Create Product",
        },
    };
}

export async function createProductFromDashboard(req, res) {
    if (!db) db = await database()
    const product_collection = db.collection(`bucket_${PRODUCT_BUCKET}`)
    const city_system_collection = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    const user_product_collection = db.collection(`bucket_${USER_PRODUCT_BUCKET}`);
    const user_collection = db.collection(`bucket_${USER_BUCKET}`)
    const city_collection = db.collection(`bucket_${CITY_BUCKET}`);

    let obj = {};
    const citySystems = [];
    const userProducts = [];
    const cities = await city_collection.find().toArray();
    const users = await user_collection.find().toArray();
    for (const product of req.body.title.split(",")) {
        const newProduct = await product_collection.insertOne({
            title: product,
            description: req.body.description,
            base_price: Math.floor(getRandomArbitrary(Number(req.body.base_price[0]), Number(req.body.base_price[1])))
        }).catch((e) => console.log("error :", e));
        if (cities.length > 0) {
            cities.forEach((city) => {
                obj['product'] = newProduct.insertedId.toString();
                obj['city'] = city._id.toString();
                obj['storage'] = Math.round(Math.floor(getRandomArbitrary(Number(req.body.storage[0]), Number(req.body.storage[1]))) / 1000) * 1000;
                obj['consumption_rate'] = getRandomArbitrary(Number(req.body.consumption_rate[0]), Number(req.body.consumption_rate[1]))
                obj['production_rate'] = getRandomArbitrary(Number(req.body.production_rate[0]), Number(req.body.production_rate[1]))
                obj['count'] = Math.floor(obj['storage'] * getRandomArbitrary(0.6, 0.8));
                const { sale_price, purchase_price } = getChangedPrices(obj["count"], obj["storage"],
                    Math.floor(getRandomArbitrary(Number(req.body.base_price[0]), Number(req.body.base_price[1]))));
                obj["sale_price"] = checkDigits(sale_price);
                obj["purchase_price"] = checkDigits(purchase_price)
                citySystems.push(obj);
                obj = {};
            })
        }
        if (users.length > 0) {
            users.map((item =>
                userProducts.push({ product: newProduct.insertedId.toString(), user: item._id.toString(), amount: 0, updated_at: new Date() })
            ))
        }
    }
    await city_system_collection.insertMany(citySystems);
    if (userProducts.length > 0)
        await user_product_collection.insertMany(userProducts);
    return { message: "Ok" }
}

export async function createWarDashboard() {

    if (!db) db = await database()
    let country_collection = db.collection(`bucket_${COUNTRY_BUCKET}`);
    let countries = await country_collection.find().toArray();

    return {
        title: "Create War",
        description:
            "Fill in all fields to automate processes ",
        inputs: [
            {
                key: "title",
                type: "string",
                value: "",
                title: "Title",
            },
            {
                key: "description",
                type: "string",
                value: "",
                title: "Description",
            },
            {
                key: "left_side",
                type: "multiselect",
                items: {
                    type: "string",
                    enum: countries.map((item) => item.title + '*' + item._id),
                },
                value: "",
                title: "Left Side",
                maxItems: 1
            },
            {
                key: "left_side_production_reduction_rate",
                type: "number",
                value: null,
                title: "Left Side Production Reduction Rate",
            },

            {
                key: "right_side",
                type: "multiselect",
                items: {
                    type: "string",
                    enum: countries.map((item) => item.title + '*' + item._id),
                },
                value: "",
                title: "Right Side",
                maxItems: 1
            },
            {
                key: "right_side_production_reduction_rate",
                type: "number",
                value: null,
                title: "Right Side Production Reduction Rate",
            },
        ],
        button: {
            color: "primary",
            target: `${PUBLIC_URL}/fn-execute/createWarFromDashboard`,
            method: "post",
            title: "Create War",
        },
    };
}
export async function createWarFromDashboard(req, res) {
    if (!db) db = await database()
    let war_collection = db.collection(`bucket_${WAR_BUCKET}`);
    addNews(
        {
            title:
                `${req.body['left_side'].split("*")[0]} entered the war with ${req.body['right_side'].split("*")[0]}.`,
            description: "", subject: "war", for_subscribers: true
        });
    Object.keys(req.body).forEach((field) => {
        req.body[field] = req.body[field].split("*")[1] ? ObjectId(req.body[field].split("*")[1]) : checkNumber(req.body[field])
    })
    req.body['in_war'] = true;
    await war_collection.insertOne(req.body)
    return {}
}


export async function createAgreementDashboard() {

    if (!db) db = await database()
    let country_collection = db.collection(`bucket_${COUNTRY_BUCKET}`);
    let product_collection = db.collection(`bucket_${PRODUCT_BUCKET}`)
    let countries = await country_collection.find().toArray();
    let products = await product_collection.find().toArray();
    return {
        title: "Create Agreement",
        description:
            "Fill in all fields to automate processes ",
        inputs: [
            {
                key: "title",
                type: "string",
                value: "",
                title: "Title",
            },
            {
                key: "description",
                type: "string",
                value: "",
                title: "Description",
            },

            {
                key: "product",
                type: "multiselect",
                items: {
                    type: "string",
                    enum: products.map((item) => item.title + '*' + item._id),
                },
                value: "",
                title: "Product",
                maxItems: 1
            },
            {
                key: "contracted_country",
                type: "multiselect",
                items: {
                    type: "string",
                    enum: countries.map((item) => item.title + '*' + item._id),
                },
                value: "",
                title: "Contracted Country",
                maxItems: 1
            },
            {
                key: "contracting_country",
                type: "multiselect",
                items: {
                    type: "string",
                    enum: countries.map((item) => item.title + '*' + item._id),
                },
                value: "",
                title: "Contracting Country",
                maxItems: 1
            },
            {
                key: "agreement_rating",
                type: "number",
                value: null,
                title: "Agreement Rating",
            },
        ],
        button: {
            color: "primary",
            target: `${PUBLIC_URL}/fn-execute/createAgreementFromDashboard`,
            method: "post",
            title: "Create Agreement",
        },
    };
}
export async function createAgreementFromDashboard(req, res) {
    if (!db) db = await database()
    let agreement_collection = db.collection(`bucket_${AGREEMENT_BUCKET}`);
    addNews(
        {
            title:
                `${req.body.contracting_country.split("*")[0]} entered the agreement with  ${req.body.contracted_country.split("*")[0]}.`,
            description: "", subject: "agreement", for_subscribers: true
        });
    Object.keys(req.body).forEach((field) => {
        req.body[field] = req.body[field].split("*")[1] ? req.body[field].split(",").leng > 1 ? req.body[field].split(",").map((item) => ObjectId(item.split("*")[1])) : ObjectId(req.body[field].split("*")[1]) : checkNumber(req.body[field])
    })
    await agreement_collection.insertOne(req.body)

    return {}
}


export async function createEmbargoDashboard() {
    if (!db) db = await database()
    let country_collection = db.collection(`bucket_${COUNTRY_BUCKET}`);
    let product_collection = db.collection(`bucket_${PRODUCT_BUCKET}`)
    let countries = await country_collection.find().toArray();
    let products = await product_collection.find().toArray()
    return {
        title: "Create Embargo",
        description:
            "Fill in all fields to automate processes ",
        inputs: [
            {
                key: "title",
                type: "string",
                value: "",
                title: "Title",
            },
            {
                key: "description",
                type: "string",
                value: "",
                title: "Description",
            },

            {
                key: "multiproducts",
                type: "multiselect",
                items: {
                    type: "string",
                    enum: products.map((item) => item.title + '*' + item._id),
                },
                value: "",
                title: "Products",
            },
            {
                key: "embargoed_country",
                type: "multiselect",
                items: {
                    type: "string",
                    enum: countries.map((item) => item.title + '*' + item._id),
                },
                value: "",
                title: "Embargoed Country",
                maxItems: 1
            },
            {
                key: "embargoing_country",
                type: "multiselect",
                items: {
                    type: "string",
                    enum: countries.map((item) => item.title + '*' + item._id),
                },
                value: "",
                title: "Embargoing Country",
                maxItems: 1
            },
            {
                key: "deleted_product_rate",
                type: "number",
                value: null,
                title: "Deleted Product Rate",
            },
            {
                key: "consumption_rate_decrease",
                type: "number",
                value: null,
                title: "Consumption Rate Decrease",
            },

        ],
        button: {
            color: "primary",
            target: `${PUBLIC_URL}/fn-execute/createEmbargoFromDashboard`,
            method: "post",
            title: "Create Embargo",
        },
    };
}
export async function createEmbargoFromDashboard(req, res) {
    if (!db) db = await database()
    let embargo_collection = db.collection(`bucket_${EMBARGO_BUCKET}`);
    addNews(
        {
            title:
                `${req.body.embargoing_country.split("*")[0]} entered the embargo with  ${req.body.embargoed_country.split("*")[0]}.`,
            description: "", subject: "embargo", for_subscribers: true
        });
    Object.keys(req.body).forEach((field) => {
        req.body[field] = req.body[field].split("*")[1] ? req.body[field].split(",").leng > 1 || field.split("multi")[1] ? req.body[field].split(",").map((item) => ObjectId(item.split("*")[1])) : ObjectId(req.body[field].split("*")[1]) : checkNumber(req.body[field]);
        if (field.split("multi")[1]) { req.body[field.split("multi")[1]] = req.body[field]; delete req.body[field] }
    })
    await embargo_collection.insertOne(req.body);

    return {}
}

async function addNews(data) {
    if (!db) db = await database();
    let news_collection = db.collection(`bucket_${NEWS_BUCKET}`);
    await news_collection.insertOne({ ...data, created_at: new Date() })
}
function getChangedPrices(count, storage, base_price) {
    const sale_price = Number(base_price) * (Math.pow(2, (1 - Math.log2(Number(count) / Number(storage)))) - 1)
    return {
        sale_price: sale_price > 0 ? sale_price : 0,
        purchase_price: sale_price - (sale_price * 0.03) > 0 ? sale_price - (sale_price * 0.03) : 0
    }
}