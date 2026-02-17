const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
} = require("discord.js");
const config = require("./config");

const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { events: [], lastReportWeekByGuild: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("data.json okunamadi, sifirdan baslatiliyor:", error.message);
    return { events: [], lastReportWeekByGuild: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function nowInTimezone() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: config.timezone || "Europe/Istanbul",
    })
  );
}

function getWeekRange(referenceDate) {
  const date = new Date(referenceDate);
  const day = date.getDay(); // 0 pazar ... 1 pazartesi
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysSinceMonday - 7); // gecen haftanin pazartesisi
  const start = new Date(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
    start.getDate()
  ).padStart(2, "0")}`;

  return { start, end, key };
}

function isManager(userId) {
  return config.managerIds.includes(userId);
}

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function buildWeeklyReport(events, start, end) {
  if (!events.length) {
    return `📊 **Haftalik Rapor** (${formatDate(start)} - ${formatDate(
      new Date(end.getTime() - 1000)
    )})\nBu hafta kayit yok.`;
  }

  const grouped = new Map();
  for (const event of events) {
    if (!grouped.has(event.userId)) {
      grouped.set(event.userId, { arti: [], eksi: [] });
    }
    grouped.get(event.userId)[event.type].push(event);
  }

  const lines = [
    `📊 **Haftalik Rapor** (${formatDate(start)} - ${formatDate(new Date(end.getTime() - 1000))})`,
  ];

  for (const [userId, points] of grouped.entries()) {
    const artiTotal = points.arti.reduce((sum, x) => sum + x.amount, 0);
    const eksiTotal = points.eksi.reduce((sum, x) => sum + x.amount, 0);

    lines.push(`\n👤 <@${userId}>`);
    lines.push(`- ➕ Toplam Arti: **${artiTotal}**`);
    for (const item of points.arti) {
      lines.push(`  - +${item.amount}: ${item.reason}`);
    }

    lines.push(`- ➖ Toplam Eksi/Uyari: **${eksiTotal}**`);
    for (const item of points.eksi) {
      lines.push(`  - -${item.amount}: ${item.reason}`);
    }
  }

  return lines.join("\n");
}

async function sendPointDM(user, type, amount, reason) {
  const message =
    type === "eksi"
      ? `Merhaba <@${user.id}>\n**${reason}** sebebinden oturu **-${amount} uyari** almissin. Bir dahaki sefere daha dikkatli olmalisin.`
      : `Merhaba <@${user.id}>\n**${reason}** sebebiyle **+${amount} arti** aldin. Tesekkurler, boyle devam!`;

  try {
    await user.send({ content: message });
  } catch (error) {
    console.warn(`DM gonderilemedi (${user.id}):`, error.message);
  }
}

async function main() {
  if (!config.token || config.token === "BURAYA_BOT_TOKEN") {
    throw new Error("config.js icinde token doldurulmamis.");
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  });

  const commands = [
    new SlashCommandBuilder()
      .setName("arti")
      .setDescription("Kullaniciya arti ver")
      .addUserOption((option) => option.setName("kullanici").setDescription("Kime?").setRequired(true))
      .addStringOption((option) => option.setName("sebep").setDescription("Sebep").setRequired(true))
      .addIntegerOption((option) =>
        option.setName("miktar").setDescription("Kac arti?").setMinValue(1).setMaxValue(50).setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("eksi")
      .setDescription("Kullaniciya eksi/uyari ver")
      .addUserOption((option) => option.setName("kullanici").setDescription("Kime?").setRequired(true))
      .addStringOption((option) => option.setName("sebep").setDescription("Sebep").setRequired(true))
      .addIntegerOption((option) =>
        option.setName("miktar").setDescription("Kac eksi?").setMinValue(1).setMaxValue(50).setRequired(true)
      ),
    new SlashCommandBuilder().setName("haftalik_rapor").setDescription("Haftalik raporu kanala gonder"),
  ].map((cmd) => cmd.toJSON());

  client.once("ready", async () => {
    console.log(`Bot giris yapti: ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);
    await guild.commands.set(commands);
    console.log("Slash komutlar yuklendi.");

    setInterval(async () => {
      const current = nowInTimezone();
      const isMonday = current.getDay() === 1;
      const isNineOClock = current.getHours() === 9;

      if (!isMonday || !isNineOClock) {
        return;
      }

      const { start, end, key } = getWeekRange(current);
      const data = loadData();

      if (data.lastReportWeekByGuild[config.guildId] === key) {
        return;
      }

      const weeklyEvents = data.events.filter((event) => {
        if (event.guildId !== config.guildId) return false;
        const eventDate = new Date(event.createdAt);
        return eventDate >= start && eventDate < end;
      });

      const channel = await client.channels.fetch(config.warningChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return;
      }

      const report = buildWeeklyReport(weeklyEvents, start, end);
      await channel.send({ content: report });
      data.lastReportWeekByGuild[config.guildId] = key;
      saveData(data);
    }, 60 * 1000);
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (!isManager(interaction.user.id)) {
      await interaction.reply({ content: "Bu komutu kullanamazsin.", ephemeral: true });
      return;
    }

    if (interaction.commandName === "haftalik_rapor") {
      const current = nowInTimezone();
      const { start, end } = getWeekRange(current);
      const data = loadData();
      const weeklyEvents = data.events.filter((event) => {
        if (event.guildId !== interaction.guildId) return false;
        const eventDate = new Date(event.createdAt);
        return eventDate >= start && eventDate < end;
      });

      const channel = await interaction.client.channels.fetch(config.warningChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        await interaction.reply({ content: "Uyari kanali bulunamadi.", ephemeral: true });
        return;
      }

      await channel.send({ content: buildWeeklyReport(weeklyEvents, start, end) });
      await interaction.reply({ content: "Haftalik rapor gonderildi.", ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser("kullanici", true);
    const reason = interaction.options.getString("sebep", true);
    const amount = interaction.options.getInteger("miktar", true);
    const type = interaction.commandName;

    const data = loadData();
    data.events.push({
      guildId: interaction.guildId,
      userId: targetUser.id,
      moderatorId: interaction.user.id,
      type,
      amount,
      reason,
      createdAt: new Date().toISOString(),
    });
    saveData(data);

    await sendPointDM(targetUser, type, amount, reason);

    const prefix = type === "arti" ? "+" : "-";
    const symbol = type === "arti" ? "✅" : "⚠️";
    await interaction.reply({
      content: `${symbol} <@${targetUser.id}> kullanicisina **${prefix}${amount}** verildi. Sebep: **${reason}**`,
    });
  });

  client.login(config.token);
}

main().catch((error) => {
  console.error("Bot baslatilamadi:", error);
  process.exit(1);
});
