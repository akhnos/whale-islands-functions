import { database, ObjectId } from "@spica-devkit/database"
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

const USER_BUCKET = process.env.USER_BUCKET_ID;


let db;
export async function updateTutorialStep(req, res) {
    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");
    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");
    if (!db) db = await database();
    const { step } = req.body
    const user_col = db.collection(`bucket_${USER_BUCKET}`)
    const user = await user_col.findOne(ObjectId(identity.attributes.user_id))
    if (!user.tutorial_step) user.tutorial_step = 0
    if (Number(step) > 0 && Number(step) >= user.tutorial_step) {
        await user_col.updateOne({ _id: ObjectId(user._id) }, { $set: { tutorial_step: step } })
        return res.status(200).send("Ok");
    }
    return res.status(400).send({ message: "New step must be higher than previous!" });

}


export async function getProductsByTutorialCity(req, res) {
    const token = getToken(req.headers);
    if (!token) return res.status(401).send("Unauthorized");
    const identity = await getIdentity(token);
    if (!identity) return res.status(401).send("Unauthorized");
    if (!db) db = await database();
    const user_col = db.collection(`bucket_${USER_BUCKET}`)
    const user = await user_col.findOne(ObjectId(identity.attributes.user_id))
    if (!user.tutorial_step) user.tutorial_step = 0
    let returnData = []
    if (user.tutorial_step < 3) {
        returnData = [
            {
                "_id": "620b754c232b848a0ce64efd",
                "product": {
                    "_id": "620b754c232b848a0ce64ee4",
                    "title": "Olive Oil",
                    "base_price": 31
                },
                "count": 87293,
                "purchase_price": 53.291,
                "sale_price": 54.94,
                "storage": 121000
            }
        ]
    } else if (user.tutorial_step < 5) {
        returnData = [
            {
                "_id": "620b754c232b848a0ce64efc",
                "product": {
                    "_id": "620b754c232b848a0ce64ee4",
                    "title": "Olive Oil",
                    "base_price": 31
                },
                "count": 93906,
                "purchase_price": 63.432,
                "sale_price": 65.394,
                "storage": 146000
            }
        ]
    }

    return res.status(200).send(returnData);

}

