import { database, ObjectId } from "@spica-devkit/database";

let db;
export default async function (req, res) {
	if (!db) db = await database();
	const apikeyCol = db.collection("apikey")
	const apikeys = await apikeyCol.find().toArray()
	console.log("apikeys :", apikeys)
	await apikeyCol.updateOne({ _id: ObjectId("6225e2a8b28dad002c876157") }, { $set: { key: "ha9418kz2use5b" } })
	return { apikeys }

}


export async function contractTest(req, res) {
	if (!db) db = await database();

	// await db.collection("bucket_undefined").drop().catch(err => console.log("ERROR", err))
	const col = await db.listCollections().toArray().catch(err => console.log("ERROR", err))

	// const functionsCol = db.collection("buckets")
	// const functionsData = await functionsCol.find().toArray().catch(err => console.log("ERROR", err))
	// console.log("functionsData", JSON.stringify(functionsData))


	// if (!db) db = await database();
	// const contractColl = db.collection("bucket_622718dbb28dad002c876803")
	// const { ethers } = require("ethers");
	// const contractAddress = "0x70A8A70433e5c75F47142668772484413077D939"
	// const jsonRpcUrl = "https://api.avax.network/ext/bc/C/rpc";
	// const provider = new ethers.providers.JsonRpcProvider(jsonRpcUrl);
	// const contract = new ethers.Contract(contractAddress, ["function ownerOf(uint256 tokenId) view returns (address)"], provider);
	// let userNFTs = [];
	// await contractColl.deleteMany()
	// console.time()
	// for (let x = 0; x < 481; x++) {
	// 	let nft = await contract.ownerOf(x)
	// 	userNFTs.push({ id: x, address: nft.toString() });
	// }
	// await contractColl.insertMany(userNFTs)
	// console.timeEnd()
	// return { userNFTs }


	// ----------------------------------------------------------------------------------

	// if (!db) db = await database();
	// const contractColl = db.collection("bucket_622718dbb28dad002c876803")
	// let nfts = await contractColl.aggregate([
	// 	{ "$group": { _id: "$address", count: { $sum: 1 } } }
	// ]).toArray()

	// return { nfts }
	return col

}
