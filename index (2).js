// استيراد المكتبات الضرورية
const express = require('express');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const axios = require('axios');
const session = require('express-session'); // إضافة مكتبة الجلسات
const app = express();
const port = 3000;

// Middleware لاستقبال البيانات بصيغة JSON
app.use(express.json());

// إعداد middleware للجلسات
app.use(session({
    secret: 'هذا_سر_سري_يجب_تغييره_بشكل_دوري_وعشوائي', // قم بتغيير هذا إلى قيمة عشوائية خاصة بك
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1000 // مدة صلاحية الجلسة لمدة 30 يوماً
    }
}));

// ---------------------------------------------
//                إعدادات البوت
// ---------------------------------------------

const CLIENT_ID = '1401637679694614778';
const CLIENT_SECRET = 'mEpEQDMhEC3xABcpzxhnlwZ8zlY8HZTt';
const BOT_TOKEN = 'MTQwMTYzNzY3OTY5NDYxNDc3OA.GBuaSq.YWiF9O6t05qKSOjBPvOG3MaTnlj5mpxKsmAsuI';
const REDIRECT_URI = 'https://08a755ea-29a6-403d-ba0b-906f8780b6a6-00-10z5b6158igf7.sisko.replit.dev/callback'; 
// تأكد من أن رابط Replit الخاص بك هو الذي يتم وضعه هنا
// هذا الرابط يجب أن يتطابق مع الرابط في بوابة مطوري Discord

// إنشاء عميل Discord جديد
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites, // إضافة Intent لجلب الدعوات
        GatewayIntentBits.GuildPresences // إضافة Intent لجلب حالات المستخدمين
    ]
});

// تعريف متغير لتخزين إعدادات السيرفر
// في مشروع حقيقي، يجب استخدام قاعدة بيانات
const serverSettings = new Map();
let welcomeMessageCount = 0; // متغير جديد لحفظ عدد رسائل الترحيب
const invites = new Map(); // كاش لحفظ دعوات السيرفرات

// عند تشغيل البوت بنجاح
client.once('ready', () => {
    console.log(`البوت جاهز! تم تسجيل الدخول كـ ${client.user.tag}`);
    // جلب كل الدعوات عند تشغيل البوت
    client.guilds.cache.forEach(async guild => {
        try {
            const guildInvites = await guild.invites.fetch();
            invites.set(guild.id, new Map(guildInvites.map(invite => [invite.code, invite.uses])));
        } catch (error) {
            console.error(`حدث خطأ أثناء جلب الدعوات للسيرفر ${guild.name}:`, error);
        }
    });
});

// عند تحديث الدعوات (مثلاً انضمام عضو جديد)
client.on('inviteCreate', invite => {
    const guildInvites = invites.get(invite.guild.id) || new Map();
    guildInvites.set(invite.code, invite.uses);
    invites.set(invite.guild.id, guildInvites);
});

client.on('inviteDelete', invite => {
    const guildInvites = invites.get(invite.guild.id);
    if (guildInvites) {
        guildInvites.delete(invite.code);
    }
});

// عند انضمام عضو جديد إلى السيرفر
client.on('guildMemberAdd', async member => {
    const guildId = member.guild.id;
    const settings = serverSettings.get(guildId);

    // Get inviter and process message placeholders
    let inviter = 'غير معروف';
    try {
        const newInvites = await member.guild.invites.fetch();
        const oldInvites = invites.get(member.guild.id) || new Map();

        for (const [code, newUses] of newInvites) {
            const oldUses = oldInvites.get(code);
            if (oldUses < newUses) {
                const invite = newInvites.get(code);
                if (invite && invite.inviter) {
                    inviter = invite.inviter.username;
                }
                break;
            }
        }
        invites.set(member.guild.id, new Map(newInvites.map(invite => [invite.code, invite.uses])));
    } catch (error) {
        console.error('Failed to fetch invites:', error);
    }

    if (settings) {
        // Assign role if specified
        if (settings.roleId) {
            try {
                const role = member.guild.roles.cache.get(settings.roleId);
                if (role) {
                    await member.roles.add(role);
                    console.log(`تم إعطاء الرتبة ${role.name} للعضو ${member.user.tag}`);
                }
            } catch (error) {
                console.error(`فشل إعطاء الرتبة للعضو ${member.user.tag}:`, error);
            }
        }

        try {
            const channel = await member.guild.channels.fetch(settings.channelId);
            if (channel && channel.isTextBased()) {
                // معالجة رسالة الترحيب المخصصة
                let welcomeMessage = settings.welcomeMessage || `أهلاً بك يا {user} في سيرفر {guildName}! نتمنى لك قضاء وقت ممتع.`;
                welcomeMessage = welcomeMessage.replace(/{user}/g, member.toString());
                welcomeMessage = welcomeMessage.replace(/{guildName}/g, member.guild.name);
                welcomeMessage = welcomeMessage.replace(/{memberCount}/g, member.guild.memberCount.toString());
                welcomeMessage = welcomeMessage.replace(/{inviter}/g, inviter);

                channel.send(welcomeMessage);
                welcomeMessageCount++; // زيادة عدد رسائل الترحيب
            }
        } catch (error) {
            console.error(`حدث خطأ أثناء إرسال رسالة الترحيب في السيرفر ${guildId}:`, error);
        }
    }
});

// تسجيل دخول البوت
client.login(BOT_TOKEN);

// ---------------------------------------------
//             وظائف مساعدة للويب
// ---------------------------------------------

// وظيفة لحفظ إعدادات قناة الترحيب
async function saveWelcomeChannel(guildId, channelId, welcomeMessage, roleId) {
    serverSettings.set(guildId, { channelId, welcomeMessage, roleId });
    console.log(`تم حفظ إعدادات السيرفر ${guildId}: قناة الترحيب: ${channelId}, رسالة: ${welcomeMessage}, رتبة: ${roleId}`);
    return { success: true, message: "تم حفظ الإعدادات بنجاح." };
}

// ---------------------------------------------
//              نقاط نهاية (API Endpoints)
// ---------------------------------------------

// إضافة هذه النقطة لخدمة ملف index.html عند زيارة الرابط الرئيسي
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// نقطة نهاية للمصادقة (OAuth2)
app.get('/login', (req, res) => {
    const scope = 'identify guilds';
    const redirectUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}`;
    res.redirect(redirectUrl);
});

// نقطة نهاية لمعالجة ردود المصادقة (Callback)
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('لم يتم العثور على رمز المصادقة.');
    }

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const { access_token } = tokenResponse.data;
        req.session.discordAccessToken = access_token;

        res.redirect('/'); // توجيه المستخدم إلى الصفحة الرئيسية بعد المصادقة
    } catch (error) {
        console.error('خطأ في المصادقة:', error);
        res.status(500).send('فشل المصادقة.');
    }
});

// نقطة نهاية للتحقق من حالة المصادقة
app.get('/api/is-authenticated', (req, res) => {
    res.json({ isAuthenticated: !!req.session.discordAccessToken });
});

// نقطة نهاية لجلب معلومات البوت
app.get('/api/bot-info', (req, res) => {
    const serverCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    const onlineUserCount = client.guilds.cache.reduce((acc, guild) => acc + guild.presences.cache.filter(p => p.status !== 'offline').size, 0);
    res.json({ serverCount, userCount, onlineUserCount, welcomeMessageCount });
});

// نقطة نهاية لجلب معلومات المستخدم
app.get('/api/user', async (req, res) => {
    const access_token = req.session.discordAccessToken;
    if (!access_token) {
        return res.status(401).json({ error: 'غير مصرح به' });
    }
    try {
        const { data: user } = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        res.json(user);
    } catch (error) {
        console.error('خطأ في جلب معلومات المستخدم:', error);
        res.status(500).json({ error: 'تعذر جلب معلومات المستخدم.' });
    }
});

// نقطة نهاية لجلب السيرفرات التي يملك فيها المستخدم صلاحيات إدارية
app.get('/api/guilds', async (req, res) => {
    const access_token = req.session.discordAccessToken;
    if (!access_token) {
        return res.status(401).json({ error: 'غير مصرح به' });
    }
    try {
        const { data: guilds } = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const adminGuilds = guilds.filter(g => g.owner || (new PermissionsBitField(BigInt(g.permissions))).has(PermissionsBitField.Flags.Administrator));
        res.json(adminGuilds);
    } catch (error) {
        console.error('خطأ في جلب السيرفرات:', error);
        res.status(500).json({ error: 'تعذر جلب السيرفرات.' });
    }
});

// نقطة نهاية لجلب حالة البوت في سيرفر معين
app.get('/api/guilds/:guildId/bot-status', async (req, res) => {
    const { guildId } = req.params;
    const access_token = req.session.discordAccessToken;
    if (!access_token) {
        return res.status(401).json({ error: 'غير مصرح به' });
    }
    try {
        const guild = await client.guilds.fetch(guildId);
        const is_bot_present = guild.members.cache.has(client.user.id);
        res.json({ is_bot_present, client_id: CLIENT_ID });
    } catch (error) {
        console.error(`خطأ في جلب حالة البوت للسيرفر ${guildId}:`, error);
        res.status(500).json({ error: 'تعذر جلب حالة البوت.' });
    }
});

// نقطة نهاية لجلب إعدادات السيرفر
app.get('/api/guilds/:guildId/settings', (req, res) => {
    const { guildId } = req.params;
    const settings = serverSettings.get(guildId);
    res.json(settings || { channelId: null, welcomeMessage: '', roleId: null });
});

// نقطة نهاية لجلب قنوات السيرفر
app.get('/api/guilds/:guildId/channels', async (req, res) => {
    const { guildId } = req.params;
    try {
        const guild = await client.guilds.fetch(guildId);
        const channels = await guild.channels.fetch();
        const textChannels = channels.filter(c => c.type === 0); // 0 يمثل قناة نصية
        res.json(textChannels.map(c => ({ id: c.id, name: c.name })));
    } catch (error) {
        console.error(`خطأ في جلب قنوات السيرفر ${guildId}:`, error);
        res.status(500).json({ error: 'تعذر جلب القنوات.' });
    }
});

// نقطة نهاية لجلب رتب السيرفر
app.get('/api/guilds/:guildId/roles', async (req, res) => {
    const { guildId } = req.params;
    try {
        const guild = await client.guilds.fetch(guildId);
        const roles = await guild.roles.fetch();
        res.json(roles.filter(role => !role.managed).map(role => ({ id: role.id, name: role.name })));
    } catch (error) {
        console.error(`خطأ في جلب رتب السيرفر ${guildId}:`, error);
        res.status(500).json({ error: 'تعذر جلب الرتب.' });
    }
});

// نقطة نهاية لحفظ إعدادات البوت
app.post('/api/save-welcome-channel', async (req, res) => {
    const { guildId, channelId, welcomeMessage, roleId } = req.body;

    if (!guildId || !channelId || !welcomeMessage) {
        return res.status(400).json({ success: false, message: 'معرف السيرفر والقناة ورسالة الترحيب مطلوبة.' });
    }

    const result = await saveWelcomeChannel(guildId, channelId, welcomeMessage, roleId);
    res.json(result);
});


app.listen(port, () => {
    console.log(`خادم الويب يعمل على http://localhost:${port}`);
    console.log('يرجى التأكد من تشغيل البوت بنجاح.');
});
