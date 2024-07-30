const path = require('path')
const mongoose = require('mongoose')
const Client = require('ssh2-sftp-client');
const RobinsonFileLogs = require('../../models/RobinsonFileLogs')

const resendUnsentFiles = async (settings) => {
    const status = {
        empty: false,
        resent: false,
        fullSent: false,
        error: false
    };

    try {
        await mongoose.connect(process.env.MONGODB_URI_LOCAL, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log(`Resender process successfully connected to MongoDB`);
    } catch (err) {
        console.log(`Resender process to connect to mongoDB`);
    }

    const unsentFiles = await RobinsonFileLogs.find({
        sent: false
    });

    if (unsentFiles?.length === 0) {
        status.empty = true;
        return status;
    }

    const c = new Client();
    try {
        await c.connect({
            host: settings.robinsonsFTPHost,
            username: settings.robinsonsFTPUsername,
            password: settings.robinsonsFTPPassword,
            port: 22,
            readyTimeout: 30000,
            algorithms: {
                kex: [
                    "diffie-hellman-group1-sha1",
                    "ecdh-sha2-nistp256",
                    "ecdh-sha2-nistp384",
                    "ecdh-sha2-nistp521",
                    "diffie-hellman-group-exchange-sha256",
                    "diffie-hellman-group14-sha1"
                ],
                cipher: [
                    "3des-cbc",
                    "aes128-ctr",
                    "aes192-ctr",
                    "aes256-ctr",
                    "aes128-gcm",
                    "aes128-gcm@openssh.com",
                    "aes256-gcm",
                    "aes256-gcm@openssh.com"
                ],
                serverHostKey: [
                    "ssh-rsa",
                    "ecdsa-sha2-nistp256",
                    "ecdsa-sha2-nistp384",
                    "ecdsa-sha2-nistp521"
                ],
                hmac: [
                    "hmac-sha2-256",
                    "hmac-sha2-512",
                    "hmac-sha1"
                ]
            }
        });
    } catch (err) {
        console.log(`Resender Error Message is `, err.message);
        status.error = true;
        return status;
    }

    const unsentFilePromises = unsentFiles.map(async (file) => {
        try {
            const splitFilename = file?.fileName.split('.');
            const renamedFile = `${splitFilename[0]}.${splitFilename[1]}`;

            await c.put(path.join(settings.docsPath, 'UMBRA_POS_REPORTS', 'ROBINSON', `${file.fileName}`), `${settings.robinsonsFTPRootPath ? '/' + settings.robinsonsFTPRootPath : ''}/${renamedFile}`);
            return { fileName: file.fileName, sent: true };
        } catch (err) {
            console.log(`Err on sending is `, err);
            throw { fileName: file.fileName, err };
        }
    });

    try {
        const sentFiles = await Promise.allSettled(unsentFilePromises);

        const failedSent = [];
        for (const file of sentFiles) {
            if (file.status === 'fulfilled') {
                try {
                    await RobinsonFileLogs.findOneAndUpdate({ fileName: file.value.fileName }, { sent: true }, { new: true });
                } catch (err) {
                    console.log(err);
                }
            } else {
                failedSent.push(file.reason.fileName);
            }
        }

        status.resent = true;
        if (failedSent.length === 0) {
            status.fullSent = true;
        }
    } catch (err) {
        console.log(err);
    }

    return status;
};



process.on('message', async (message) => {
    const settings = JSON.parse(message)
    let success = false
    let resendResult
    do {
        resendResult = await resendUnsentFiles(settings)
        if ((resendResult.resent && resendResult.fullSent) || resendResult.empty) success = true
        else console.log(`Files not sent.`)
    } while (!success)

    process.send(JSON.stringify(resendResult))
})