import { database } from "@spica-devkit/database";

const REQ_ALLOCATION_BUCKET = process.env.REQ_ALLOCATION_BUCKET;

let db;
export async function calculateReqAllocation(req, res) {
    if (!db) db = await database().catch(err => {
        console.log("ERROR 1", err)
    })
    const reqAllocationCollection = db.collection(`bucket_${REQ_ALLOCATION_BUCKET}`);

    const reqAllocations = await reqAllocationCollection.find().toArray().catch(err => {
        console.log("ERROR 2", err)
    })

    let totalAllocation = 0;
    for (let item of reqAllocations) {
        totalAllocation += item.req_allocation;
    }

    return res.status(200).send({ "totalRequestedAllocation": Math.round(totalAllocation / 0.022) / 1000000 });
}