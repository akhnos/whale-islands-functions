import { database, ObjectId } from "@spica-devkit/database";
import * as Bucket from "@spica-devkit/bucket";
import * as Identity from "@spica-devkit/identity";
import jwt_decode from "jwt-decode";


const PRODUCT_BUCKET = process.env.PRODUCT_BUCKET_ID;
const USER_BUCKET = process.env.USER_BUCKET_ID;
const ORDER_BUCKET = process.env.ORDER_BUCKET_ID;
const CITY_SYSTEM_BUCKET = process.env.CITY_SYSTEM_BUCKET_ID;
const USER_PRODUCT_BUCKET = process.env.USER_PRODUCT_BUCKET_ID;
const AGENT_BUCKET = process.env.AGENT_BUCKET_ID;
const JOURNEY_BUCKET = process.env.JOURNEY_BUCKET_ID;
const CONFIG_BUCKET = process.env.CONFIG_BUCKET_ID;



let db;

const initializeIdentity = (token) => {
    Identity.initialize({ identity: token });
    Bucket.initialize({ identity: token })
}
const getToken = (headers) => {
    const authorization = headers.get("authorization");
    if (!authorization) return null;
    const token = authorization.split(" ")[1]; //Expect IDENTITY eyJhbGciOiJIU...IEUV_0dsmLZ4JE
    return token;
}
const getIdentity = async (token) => {
    let decoded;
    try {
        decoded = await jwt_decode(token)
    }
    catch (e) {
        console.log("JWT error :", e)
    }
    return decoded;
}

export async function sendOrder(req, res) {

    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");
    initializeIdentity(token)
    let identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");

    console.log(`processing order ${JSON.stringify(req.body)}`);

    const { orderType, amount, productId, cityId } = req.body;

    if (!db) db = await database()
    const product_collection = db.collection(`bucket_${PRODUCT_BUCKET}`);
    const order_collection = db.collection(`bucket_${ORDER_BUCKET}`);
    const user_collection = db.collection(`bucket_${USER_BUCKET}`);
    const city_system_collection = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    const user_product_collection = db.collection(`bucket_${USER_PRODUCT_BUCKET}`);
    const config_collection = db.collection(`bucket_${CONFIG_BUCKET}`);

    const productData = await product_collection.findOne(ObjectId(productId)).catch((e) => console.log("err :", e));
    const userData = await user_collection.findOne(ObjectId(identity.attributes.user_id)).catch((e) => console.log("err :", e));
    const userProductData = await user_product_collection.findOne({ user: userData._id.toString(), product: productId.toString() })
    const citySystemData = await city_system_collection.findOne({ product: productId, city: cityId });

    const orderObj = {
        order_type: Number(orderType),
        user: userData._id.toString(),
        product: productData._id.toString(),
        amount: amount,
        created_at: new Date(),
        city: cityId,
        status: 1,
        status_message: "Success",
        price: 0
    }
    const prices = getChangedPrices(citySystemData.count, citySystemData.storage, productData.base_price, Number(orderType) ? amount : -amount);
    orderObj['price'] = Number(orderType)
        ? prices.purchase_price + getPriceWithFee(prices.purchase_price)
        : prices.sale_price - getPriceWithFee(prices.sale_price);

    if (!Number(orderType) && (Number(userData.balance) < orderObj['price'])) { //For buy operation if the price bigger than your balance;
        orderObj['status_message'] = `User balance is not enought! User Balance:${userData.balance},Order Price :${orderObj['price']}`
        orderObj['status'] = 0;
        await order_collection.insertOne(orderObj).catch((e) => console.log("default function error :", e));
        return res.status(400).send(orderObj['status_message']);
    }
    if (Number(orderType) && (Number(userProductData.amount) < amount)) { //For sell operation if the price bigger than your balance;
        orderObj['status'] = 0;
        orderObj['status_message'] = `Product amount of user have is not enough! User Product Amount:${userProductData.amount},Order Amount :${amount}`
        await order_collection.insertOne(orderObj).catch((e) => console.log("default function error :", e));
        return res.status(400).send(orderObj['status_message']);
    }
    const newCount = Number(orderType) == 0 ? citySystemData.count + amount : citySystemData.count - amount;
    await city_system_collection.updateOne(
        { _id: ObjectId(citySystemData._id) },
        {
            $set: {
                "count": newCount > 0 ? newCount > citySystemData.storage ? citySystemData.storage : Math.floor(newCount.toFixed(3)) : 0,
            }
        }
    ).catch((e) => console.log("default function error :", e));

    await order_collection.insertOne(orderObj).catch((e) => console.log("default function error :", e));

    userData.balance = Number(userData.balance) || 0;
    userData.balance += Number(orderType) ? Number(orderObj['price']) : - Number(orderObj['price']);
    userData.balance = Number(userData.balance.toFixed(3))

    await Bucket.data.update(USER_BUCKET, userData._id.toString(), userData)
        .catch((e) => console.log("user balance update error :", e))

    userProductData.amount += Number(orderType) ? -amount : amount;
    await Bucket.data.update(USER_PRODUCT_BUCKET, userProductData._id.toString(), userProductData)
        .catch((e) => console.log("user product update error :", e))

    //Set Current Order Balance 
    let currentOrderBalance = await config_collection.findOne({ key: "current_order_balance" });
    currentOrderBalance = JSON.parse(currentOrderBalance.value);
    let newCurrentOrderBalance = (Number(orderType) ? orderObj.price : -orderObj.price);

    if (new Date(currentOrderBalance.date).getDay() == new Date().getDay())
        newCurrentOrderBalance += Number(currentOrderBalance.balance);

    await config_collection.updateOne(
        { key: "current_order_balance" },
        {
            $set: {
                value: JSON.stringify({
                    date: new Date().getTime(),
                    balance: newCurrentOrderBalance
                })
            }
        })
    //Set Current Order Balance End 
    return res.status(200).send("Ok");
}


function getChangedPrices(count, storage, base_price, amount = 1) {

    let sale_price =
        Math.abs(Number(amount)) * Number(base_price) *
        (Math.pow(2, (1 - ((Math.log2(Number(count) / Number(storage))
            + Math.log2((Number(count) - Number(amount) + 1) / Number(storage))) / 2))) - 1);
    sale_price = Number(sale_price);

    return {
        sale_price: sale_price > 0 ? sale_price.toFixed(3) : 0,
        purchase_price: sale_price - (sale_price * 0.03) > 0 ? Number((sale_price - (sale_price * 0.03)).toFixed(3)) : 0
    }
}

const getPriceWithFee = (price) => {
    return (2 * Number(price / 1000))
}


export async function getAmountByBalance(req, res) {
    let { balance, cityId, productId, orderType } = req.query;
    if (!db) db = await database();
    const product_collection = db.collection(`bucket_${PRODUCT_BUCKET}`);
    const product = await product_collection.findOne(ObjectId(productId));
    const city_system_collection = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    const systemData = await city_system_collection.findOne({ city: cityId, product: productId });
    let amount = 0;
    balance = Number(balance) - getPriceWithFee(balance) // fee
    let totalCount = systemData.count;
    let comparedPrice;
    let inLoop = true;
    let counter = 0;
    while (inLoop) {
        counter++;
        comparedPrice = getChangedPrices(systemData.count, systemData.storage, product.base_price, Number(orderType) ? totalCount : -totalCount)[Number(orderType) ? 'purchase_price' : 'sale_price'];
        if (Math.ceil(balance < 10 ? balance * 100 : balance) < Math.ceil(balance < 10 ? comparedPrice * 100 : comparedPrice)) {
            totalCount = totalCount / 2;
        }
        else if (Math.ceil(balance < 10 ? balance * 100 : balance) > Math.ceil(balance < 10 ? comparedPrice * 100 : comparedPrice)) {
            totalCount += totalCount / 2
        } else { inLoop = false; amount = Number(totalCount.toFixed(3)); console.log("counter :", counter, comparedPrice) }
    }
    return { amount }

}


export async function getPriceByAmount(req, res) {

    const { amount, cityId, productId, orderType } = req.query;
    if (!db) db = await database();
    const product_collection = db.collection(`bucket_${PRODUCT_BUCKET}`);
    const product = await product_collection.findOne(ObjectId(productId));
    const city_system_collection = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    const systemData = await city_system_collection.findOne({ city: cityId, product: productId });
    const prices = getChangedPrices(systemData.count, systemData.storage, product.base_price, Number(orderType) ? amount : -amount);
    return prices

}

export async function patchCitySystem(change) {
    //will be triggered when patch event
    await updateCitySystemPrices(change)
    return
}

export async function replaceCitySystem(change) {
    //will be triggered when put event
    await updateCitySystemPrices(change)
    return
}
async function updateCitySystemPrices(change) {
    console.log("updateCitySystemPrices ", change)
    let citySystemData = change.document;
    if (!db) db = await database()
    const product_collection = db.collection(`bucket_${PRODUCT_BUCKET}`);
    const city_system_col = db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    const product = await product_collection.findOne(ObjectId(citySystemData.product))
    const { sale_price, purchase_price } = getChangedPrices(citySystemData.count, citySystemData.storage, product.base_price)
    if (sale_price == citySystemData.sale_price & citySystemData.purchase_price == purchase_price) return
    citySystemData.sale_price = Number(sale_price);
    citySystemData.purchase_price = Number(purchase_price);
    return await city_system_col.updateOne({ _id: ObjectId(citySystemData._id) }, { $set: { sale_price: Number(sale_price), purchase_price: Number(purchase_price) } })
}


export async function increaseYieldFarming(change) {

    if (!db) db = await database();
    const agent_col = await db.collection(`bucket_${AGENT_BUCKET}`);

    const order = change.document;
    const agents = await agent_col.find({ city: order.city }).toArray();

    if (agents && agents.length == 0) return

    let totalPower = 0;
    agents.forEach((item) => totalPower += item.power);

    const pricePerPower = (order.price / 1000) / totalPower;
    const promises = [];
    agents.forEach((agent) => {
        agent.collectable_wisl = agent.collectable_wisl || 0
        const increasedCollect = agent.collectable_wisl + agent.power * pricePerPower
        const newcollectableWisl = increasedCollect > agent.safe ? agent.safe : increasedCollect;
        promises.push(agent_col.updateOne({ _id: ObjectId(agent._id) }, { $set: { collectable_wisl: newcollectableWisl } }))
    })
    await Promise.all(promises).catch((e) => console.log("e :", e))
    return true
}


export async function getProductsByCity(req, res) {

    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");

    initializeIdentity(token)
    let identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");

    if (!db) db = await database();
    const { city } = req.query;

    const city_system_col = await db.collection(`bucket_${CITY_SYSTEM_BUCKET}`);
    const user_col = await db.collection(`bucket_${USER_BUCKET}`);
    const journey_col = await db.collection(`bucket_${JOURNEY_BUCKET}`);
    const agent_col = await db.collection(`bucket_${AGENT_BUCKET}`);
    const product_col = await db.collection(`bucket_${PRODUCT_BUCKET}`);

    const user = await user_col.findOne({ identity: identity._id });
    const products = await product_col.find().toArray();
    let lastJourney = await journey_col.find({ user: user._id.toString(), is_completed: true }).sort({ "_id": -1 }).limit(1).toArray();

    let systemData;
    lastJourney = lastJourney[0] || {}
    let userAgentInCity;

    if (lastJourney.city && lastJourney.city == city) {
        systemData = await city_system_col.find({ city }).toArray();
    }
    if (!systemData && user.merchants && user.merchants.length > 0) {
        userAgentInCity = await agent_col.findOne({ $and: [{ _id: { $in: user.merchants.map((item) => ObjectId(item)) } }, { city }] });
        if (userAgentInCity) {
            const limitProduct = Math.round((userAgentInCity.network * products.length) / 100)
            if (limitProduct == 0) systemData = [];
            else systemData = await city_system_col.find({ city }).sort({ base_price: 1 }).limit(limitProduct).toArray();
        }
    }

    if (!systemData)
        return res.status(403).send("You are not close to this city or you do not have an agent there! !")

    systemData = systemData.map((item) => {
        return {
            _id: item._id,
            product: products.find((product) => product._id.toString() == item.product),
            count: item.count,
            purchase_price: item.purchase_price,
            sale_price: item.sale_price,
            storage: item.storage
        }
    })

    return res.status(201).send(systemData);
}