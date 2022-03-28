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

const AUCTION_BUCKET = process.env.AUCTION_BUCKET_ID;
const USER_BUCKET = process.env.USER_BUCKET_ID
const REQUEST_BID_BUCKET = process.env.REQUEST_BID_BUCKET_ID;

let db;

export async function getProductById(req, res) {
	if (!db) db = await database();
	const { collection_id, product_id } = req.query;
	if (!collection_id || !product_id) return res.status(404).send("Bad Request !");

	const auction_col = db.collection("bucket_" + AUCTION_BUCKET);
	const product_col = db.collection("bucket_" + collection_id)
	const user_col = db.collection("bucket_" + USER_BUCKET);

	const auction = await auction_col.findOne({ collection_id, product_id });
	if (auction.can_bid && new Date(auction.end_date) < new Date()) {
		auction.can_bid = false;
		await auction_col.updateOne(
			{ _id: ObjectId(auction._id) },
			{
				$set: { can_bid: false }
			})
			.catch((e) => console.log("e :", e))
	}
	if (!auction.bids) auction.bids = [];
	const users = await user_col.find({ _id: { $in: [...auction.bids.map((item) => ObjectId(item['from'])), ObjectId(auction.owner)] } }).toArray();
	if (auction && auction.bids && auction.bids.length > 0) {
		auction.bids.forEach((element) => {
			element['from'] = users.find((item) => item._id == element['from']);
			element['from'] = { _id: element['from']._id, thumbnail: element['from'].thumbnail, username: element['from'].username }
		});
		auction.max_bid = auction.bids[auction.bids.length - 1].price
		if (!auction.can_bid) {
			auction.winner = auction.bids[auction.bids.length - 1]['from']._id.toString()
		}
	}
	auction.owner = auction.owner ? users.find((item) => item._id.toString() == auction.owner.toString()) : auction.owner;
	const product = await product_col.findOne(ObjectId(product_id));
	product["auction"] = auction;
	return res.status(201).send(product);
}
export async function getProductsByNftIds(req, res) {
	if (!db) db = await database();
	const { ids } = req.query;
	if (!ids) return res.status(404).send("Bad Request !");

	const auction_col = db.collection("bucket_" + AUCTION_BUCKET);

	const auctions = await auction_col.find({ nft_id: { $in: ids } }).toArray()

	const auctionsByGroup = auctions.reduce((r, a) => {
		r[a.collection_id] = [...r[a.collection_id] || [], a];
		return r;
	}, {});
	let products = [];
	let product_col;
	for (let item of Object.keys(auctionsByGroup)) {
		product_col = db.collection("bucket_" + item)
		const productsInGroup = await product_col.find({ _id: { $in: auctionsByGroup[item].map((element) => ObjectId(element.product_id)) } }).toArray();
		products = products.concat(productsInGroup)
	}
	products = products.map((item) => {
		item["auction"] = auctions.find((auction) => auction.product_id == item._id.toString())
		return item
	})

	return res.status(201).send(products);
}

export async function getUserById(req, res) {
	if (!db) db = await database();
	const { id } = req.query;
	if (!id) return res.status(404).send("Bad Request")
	const user_col = db.collection("bucket_" + USER_BUCKET);
	const user = await user_col.findOne(ObjectId(id));

	if (!user) return res.status(404).send("Bad Request");
	return res.status(200).send({
		wallet: user.wallet,
		_id: id,
		username: user.username,
		thumbnail: user.thumbnail

	})
}

export async function requestBid(req, res) {
	const token = getToken(req.headers);
	if (!token) return res.status(401).send("Unauthorized");
	const identity = await getIdentity(token);
	if (!identity) return res.status(401).send("Unauthorized");

	const { auction, nft_id } = req.body
	if (!auction || !nft_id) return res.status(404).send("Bad Request");
	if (!db) db = await database();
	const request_bid_coll = db.collection(`bucket_${REQUEST_BID_BUCKET}`)
	await request_bid_coll.insertOne({ auction, nft_id, user: identity.attributes.user_id, created_at: new Date() })
	return res.status(201).send("Your request has been received")
}
