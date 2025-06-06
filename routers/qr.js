const {
    default: Devtrix_Tech,
    useMultiFileAuthState,
    Browsers,
    delay,
    jidNormalizedUser,
    DisconnectReason,
    makeInMemoryStore
} = require("@whiskeysockets/baileys");

const { devtrixId, removeFile } = require('../lib');
const express = require("express");
const router = express.Router();
const pino = require("pino");
const { toBuffer } = require("qrcode");
const path = require('path');
require('dotenv').config();
const fs = require('fs').promises;
const fsSync = require('fs'); 
const NodeCache = require('node-cache');
const { Boom } = require("@hapi/boom");
const axios = require('axios');
const SESSIONS_API_URL = process.env.SESSIONS_API_URL;
const SESSIONS_API_KEY = process.env.SESSIONS_API_KEY;

async function uploadCreds(id) {
    try {
        const authPath = path.join(__dirname, 'temp', id, 'creds.json');
        
        try {
            await fs.access(authPath);
        } catch {
            console.error('Creds file not found at:', authPath);
            return null;
        }

        const credsData = JSON.parse(await fs.readFile(authPath, 'utf8'));
        const credsId = devtrixId();
        
        const response = await axios.post(
            `${SESSIONS_API_URL}/api/uploadCreds.php`,
            { credsId, credsData },
            {
                headers: {
                    'x-api-key': SESSIONS_API_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );
        return credsId;
    } catch (error) {
        console.error('Error uploading credentials:', error.response?.data || error.message);
        return null;
    }
}

router.get("/", async (req, res) => {
    const id = devtrixId();
    const authDir = path.join(__dirname, 'temp', id);
        
    try {
        try {
            await fs.access(authDir);
        } catch {
            await fs.mkdir(authDir, { recursive: true });
        }

        async function DEVTRIX_QR_CODE() {
            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            const msgRetryCounterCache = new NodeCache();

            try {
                let Devtrix = Devtrix_Tech({
                    printQRInTerminal: false,
                    logger: pino({ level: "silent" }),
                    browser: Browsers.baileys("Desktop"),
                    auth: state,
                    msgRetryCounterCache,
                    defaultQueryTimeoutMs: undefined
                });

                Devtrix.ev.on("connection.update", async (update) => {
                    const { connection, lastDisconnect, qr } = update;

                    if (qr) {
                        try {
                            const qrBuffer = await toBuffer(qr);
                            if (!res.headersSent) {
                                res.type('png').send(qrBuffer);
                            }
                        } catch (qrError) {
                            console.error('QR render error:', qrError);
                            if (!res.headersSent) {
                                res.status(500).send("QR generation failed");
                            }
                        }
                    }

                    if (connection === "open") {
                        try {
                            await delay(3000); 
                            const sessionId = await uploadCreds(id);
                            if (!sessionId) {
                                throw new Error('Failed to upload credentials');
                            }
                            
                            const session = await Devtrix.sendMessage(Devtrix.user.id, { text: sessionId });
                            
                            const DEVTRIX_TEXT = `
✅sᴇssɪᴏɴ ɪᴅ ɢᴇɴᴇʀᴀᴛᴇᴅ✅*
______________________________
╭┉┉◇
║『 𝐘𝐎𝐔'𝐕𝐄 𝐂𝐇𝐎𝐒𝐄𝐍 DEVTRIX』
╰┅┅◇
╭───◇
╞ 『••• 𝗩𝗶𝘀𝗶𝘁 𝗙𝗼𝗿 𝗛𝗲𝗹𝗽 •••』
╞〠 𝐓𝐮𝐭𝐨𝐫𝐢𝐚𝐥: _youtube.com/@Exton.zw0_
╞⭖ 𝐎𝐰𝐧𝐞𝐫: _https://t.me/Extontony_
╞⟴ 𝐑𝐞𝐩𝐨: _https://github.com/extontony/devtrix_
╞⭖ 𝐕𝐚𝐥𝐢𝐝𝐚𝐭𝐨𝐫: _https://pairing.giftedtech.web.id/validate_
╞〠 𝐖𝐚𝐂𝐡𝐚𝐧𝐧𝐞𝐥: _https://whatsapp.com/channel/0029VbA6MSYJUM2TVOzCSb2A_
║ 💜💜💜
╰┈┈┈┈┈◇ 
 DEVTRIX 2.0
______________________________

Use the Quoted Session ID to Deploy your Bot
Validate it First Using the Validator Link.`; 
                            
                            await Devtrix.sendMessage(Devtrix.user.id, { text: DEVTRIX_TEXT }, { quoted: session });
                            await delay(1000);
                            await Devtrix.ws.close();
                            await removeFile(authDir);
                            
                        } catch (error) {
                            console.error('Session processing failed:', error);
                            
                            try {
                                await Devtrix.sendMessage(Devtrix.user.id, {
                                    text: '⚠️ Session upload failed. Please try again.'
                                });
                            } catch (msgError) {
                                console.error('Failed to send error message:', msgError);
                            }
                            
                            try {
                                await Devtrix.ws.close();
                                await removeFile(authDir);
                            } catch (cleanupError) {
                                console.error('Cleanup failed:', cleanupError);
                            }
                        }
                    }

                    if (connection === "close") {
                        const statusCode = new Boom(lastDisconnect?.error)?.output.statusCode;
                        
                        if (statusCode === DisconnectReason.restartRequired) {
                            await delay(2000);
                            DEVTRIX_QR_CODE().catch(err => console.error('Restart failed:', err));
                        }
                    }
                });

                Devtrix.ev.on('creds.update', saveCreds);

            } catch (error) {
                console.error("Initialization error:", error);
                try {
                    await removeFile(authDir);
                } catch (cleanupError) {
                    console.error('Initial cleanup failed:', cleanupError);
                }
                
                if (!res.headersSent) {
                    res.status(500).send("Initialization failed");
                }
            }
        }

        await DEVTRIX_QR_CODE();
    } catch (error) {
        console.error("Fatal error:", error);
        try {
            await removeFile(authDir);
        } catch (finalCleanupError) {
            console.error('Final cleanup failed:', finalCleanupError);
        }
        
        if (!res.headersSent) {
            res.status(500).send("Service unavailable");
        }
    }
});

module.exports = router;
