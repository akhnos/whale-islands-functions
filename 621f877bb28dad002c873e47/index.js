import * as Bucket from "@spica-devkit/bucket";
import { database, ObjectId } from "@spica-devkit/database";

const json2csv = require("json2csv").parse;
const admz = require("adm-zip");
const XLSX = require("xlsx");
const csv = require("csvtojson");

const formats = [
    {
        name: "csv",
        mimeType: "text/csv",
    },
    {
        name: "xlsx",
        mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
];
let db;
Bucket.initialize({ apikey: process.env.AUTH_APIKEY });
const PUBLIC_URL = process.env.__INTERNAL__SPICA__PUBLIC_URL__;

export async function exportComponent() {
    const [bucketIds, properties] = await Bucket.getAll().then((buckets) =>
        buckets.reduce(
            (acc, curr) => {
                acc[0].push(curr._id);
                acc[1].push(...Object.keys(curr.properties));
                return acc;
            },
            [[], []]
        )
    );

    return {
        title: "Export Bucket-Data",
        description: `This asset will allow you to export your bucket-data from spica server to your local machine. 
Select bucketid, you can enter specific columns that you need or do not enter anything if you want to include all columns.
Also you can filter bucket-data that will be exported by using filter. 
Select a export file format and click the export button to start process.`,
        inputs: [
            {
                key: "bucketId",
                type: "string",
                enum: bucketIds,
                value: null,
                title: "Bucket id",
            },
            {
                key: "columns",
                type: "multiselect",
                items: {
                    type: "string",
                    enum: Array.from(new Set(properties)),
                },
                value: null,
                title: "Columns(properties)",
            },
            {
                key: "queryFilter",
                type: "string",
                value: null,
                title: "Filter",
            },
            {
                key: "format",
                type: "string",
                value: "csv",
                enum: formats.map((f) => f.name),
                title: "File format",
            },
        ],
        button: {
            color: "primary",
            target: `${PUBLIC_URL}/fn-execute/start-export`,
            method: "get",
            title: "Export",
        },
    };
}

export async function startExport(req, res) {
    const { bucketId, columns, queryFilter, format } = req.query;

    //If columns are null, function will export all columns.
    //If queryFilter is null, function will export all data.

    const schema = await Bucket.get(bucketId).catch((e) => {
        res.status(400).send({ message: e });
        return undefined;
    });

    if (!schema) {
        return res;
    }

    const datas = await Bucket.data
        .getAll(bucketId, {
            queryParams: {
                filter: queryFilter || {},
            },
        })
        .catch((e) => {
            console.error(e);
            return undefined;
        });

    if (!datas || !datas.length) {
        return res.status(400).send({ message: "Could not find any bucket-data" });
    }

    let headers = Object.keys(schema.properties); // Get properties
    if (columns && columns != "null") {
        headers = columns.split(",");
    }

    let formattedString = json2csv(datas, { fields: headers });

    headers.forEach((item) => {
        formattedString = formattedString.replace(
            item,
            item.replace("_", " ").toUpperCase()
        );
        // Setting headers of csv, for example "_id" and "first_name" keys will be "ID" AND "FIRST NAME" header.
    });

    const zp = new admz();

    switch (format) {
        case "csv":
            zp.addFile(
                "download-" + Date.now() + ".csv",
                Buffer.alloc(formattedString.length, formattedString),
                "entry comment goes here"
            );
            break;

        case "xlsx":
            zp.addFile(
                "download-" + Date.now() + ".xlsx",
                Buffer.alloc(formattedString.length, formattedString),
                "entry comment goes here"
            );
            break;

        default:
            return res.status(400).send(`Unknown format type ${format}`);
    }

    res.headers.set(
        "Content-Disposition",
        "attachment; filename=download-" + Date.now() + ".zip"
    );
    res.headers.set("Content-Type", "application/octet-stream");

    return res.status(200).send(zp.toBuffer());
}

export async function importComponent() {
    return {
        title: "Import Bucket-Data",
        description: `This asset will allow you to import your bucket-data in csv or xlsx format to this spica server. 
Enter the bucket id of bucket-data, select the file format then click the import button to start process.`,
        inputs: [
            {
                key: "bucket_id",
                type: "string",
                enum: await Bucket.getAll().then((buckets) =>
                    buckets.map((b) => b._id)
                ),
                value: null,
                title: "Bucket Id",
            },
            {
                key: "file",
                type: "file",
                value: null,
                title: "Select a file",
                accept: formats.map((f) => f.mimeType).join(","),
            },
        ],
        button: {
            color: "primary",
            target: `${PUBLIC_URL}/fn-execute/start-import`,
            method: "post",
            title: "Import",
            enctype: "multipart/form-data",
        },
    };
}

// Request content type must be multipart/form-data
export async function startImport(req, res) {
    req.body = req.body || [];

    let bucketId = req.body.find((b) => b.name == "bucket_id");
    if (!bucketId) {
        return res.send("Bucket id has not been provided.");
    }
    bucketId = bucketId.data.toString();

    const schema = await Bucket.get(bucketId).catch((e) => {
        res.status(400).send({ message: e });
        return undefined;
    });

    if (!schema) {
        return;
    }

    const file = req.body.find(
        (b) => isCsvContent(b.type) || isXlsxContent(b.type)
    );
    if (!file) {
        return res
            .status(404)
            .send(
                `Could not found any file in appropriate format(${formats
                    .map((f) => f.name)
                    .join(",")}).`
            );
    }

    let bucketData = [];

    if (isCsvContent(file.type)) {
        bucketData = await csv({
            output: "json",
        }).fromString(file.data.toString());
    } else if (isXlsxContent(file.type)) {
        const workbook = XLSX.read(new Uint8Array(file.data), {
            type: "array",
        });

        const first_sheet_name = workbook.SheetNames[0];

        // Get worksheet
        const worksheet = workbook.Sheets[first_sheet_name];
        // Convert to json
        bucketData = XLSX.utils.sheet_to_json(worksheet, { raw: true });
    }

    bucketData = prepareBucketData(bucketData, schema);
    console.log(bucketData)
    if (!db) db = await database();
    const bucketColl = db.collection("bucket_" + bucketId)
    await bucketColl.deleteMany()
    return Promise.all(
        bucketData.map((bdata) => bucketColl.insertOne(bdata))
    ).catch((e) => res.status(e.statusCode).send(e.message));
}

// ------UTILITIES------
function prepareBucketData(entries, schema) {
    return entries.map((entry) => {
        const newEntry = {};
        Object.entries(entry).forEach(([key, value]) => {
            key = key.toLowerCase().split(" ").join("_");
            if (key == "_id") newEntry["_id"] = ObjectId(value)
            else
                newEntry[key] = castToOriginalType(value, schema.properties[key].type);
        });
        Object.keys(newEntry).forEach((key) => {
            if (newEntry[key] == "") delete newEntry[key]
        });
        return newEntry;
    });
}

function isCsvContent(type) {
    return type == formats.find((f) => f.name == "csv").mimeType;
}
function isXlsxContent(type) {
    return type == formats.find((f) => f.name == "xlsx").mimeType;
}

function castToOriginalType(data, type) {
    switch (type) {
        case "string":
            return data.toString()
        case "number":
            return Number(data);
        case "boolean":
            return data.toString().toLowerCase() == "true" ? true : false;
        case "date":
            return new Date(data).toISOString();
        case "location":
            return JSON.parse(data || JSON.stringify(""))
        default:
            return data;
    }
}
