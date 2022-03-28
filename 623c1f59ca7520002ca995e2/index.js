import * as Bucket from "@spica-devkit/bucket";
const nodemailer = require("nodemailer");

const nodeMailerUser = process.env.SMTP_USER || null;
const nodeMailerHost = process.env.SMTP_HOST || null;
const nodeMailerPassword = process.env.SMTP_PASSWORD || null;
const mailFrom = process.env.MAIL_FROM || null

export default async function(change) {

    console.log("Sending a mail. Parameters are: ", change);

    let buckets = {
        templates: process.env.TEMPLATES_BUCKET_ID,
    };

    Bucket.initialize({ apikey: process.env.MAILER_API_KEY });
    let template = await Bucket.data.getAll(buckets.templates, {
        queryParams: { filter: `template=='${change.current.template}'` }
    });
    template = template[0];

    let content = template.content;
    let variables = JSON.parse(change.current.variables);
    let emails = change.current.emails;

    for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    if (emails.length) {
        for (let email of emails) {
            _sendEmail(email,template.subject,content)
        }
    }
}

function _sendEmail(email, subject, message) {
    if(nodeMailerHost && nodeMailerUser && nodeMailerPassword && mailFrom){
        var transporter = nodemailer.createTransport({
            direct: true,
            host: nodeMailerHost,
            port: 465,
            auth: {
                user: nodeMailerUser,
                pass: nodeMailerPassword
            },
            secure: true
        });
    
        var mailOptions = {
            from: mailFrom,
            to: email,
            subject: subject,
            html:
                "<html><head><meta http-equiv='Content-Type' content='text/plain'></head><body><table style='width: 100%;background-color:rgb(233,233,233);font-family: arial'><tr><td>" +
                "<table style='border-radius:3px;padding: 20px; margin: 30px auto; background-color:rgb(255,255,255);width:600px;position:relative;word-break: break-word;'>" +
                "<tr><td style='text-align:center'>" +
                "<img alt='WhaleIslands' width='200' height='200' src='https://whale-islands-stg-c92f1.hq.spicaengine.com/api/storage/6241a57d3a3d6a002cb08737/view' />" +
                "</td></tr>" +
                "<tr><td>" +
                message +
                "</table> </td></tr></table></body></html>"
        };
    
        transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                console.log(error);
            } else {
                console.log("Email sent: " + info.response);
            }
        });
    }else{
        console.log("Please set your all ENVIRONMENT VARIABLES");
        return null;
    }
}
