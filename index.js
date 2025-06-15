/**
 * Discord Ticket Bot with Discount Code Option
 * 
 * Features:
 * - /ticket: Creates a private ticket channel for the user
 * - /discount [code]: Validate discount coupon in ticket channel
 * - /close: Close the ticket channel (by ticket creator or support)
 * 
 * Requirements:
 * - Node.js 16.9+
 * - discord.js v14
 * 
 * Setup:  
 * 1. Install dependencies: npm install discord.js @discordjs/rest discord-api-types dotenv  
 * 2. Create a .env file with BOT_TOKEN and GUILD_ID  
 * 3. Run with: node index.js
 */

import { Client, GatewayIntentBits, Partials, PermissionsBitField, ChannelType, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.BOT_TOKEN;
const guildId = process.env.GUILD_ID;

// Hardcoded valid discount codes for demo
const validDiscountCodes = new Set([
    'ILLEGAL10',
  ]);

// Support role name (adjust to your server)
const SUPPORT_ROLE_NAME = 'Support';

// Client setup with intents needed for guilds and messages
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
});

// Register slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Create a new support ticket'),

    new SlashCommandBuilder()
        .setName('discount')
        .setDescription('Apply a discount code to your ticket')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('The discount coupon code')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('close')
        .setDescription('Close your ticket channel'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

async function registerCommands() {
    try {
        console.log('Started refreshing application (/) commands...');
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, guildId),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

// Utility: Check if ticket channel (contains user ID in topic)  
function isTicketChannel(channel, userId) {
    if (!channel || !channel.topic) return false;
    return channel.topic.includes(`TicketOwnerID:${userId}`);
}

// Event: Bot ready
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands();
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guild, member, channel } = interaction;

    if (!guild) {
        await interaction.reply({ content: 'Commands can only be used inside a server.', ephemeral: true });
        return;
    }

    // Fetch support role
    const supportRole = guild.roles.cache.find(r => r.name === SUPPORT_ROLE_NAME);

    // /ticket command
    if (commandName === 'ticket') {
        // Check if user already has open ticket channel
        const existingChannel = guild.channels.cache.find(c =>
            c.type === ChannelType.GuildText &&
            c.topic?.includes(`TicketOwnerID:${member.id}`)
        );

        if (existingChannel) {
            await interaction.reply({ content: `You already have an open ticket: ${existingChannel}`, ephemeral: true });
            return;
        }

        // Create ticket channel permissions
        const permissionOverwrites = [
            {
                id: guild.roles.everyone,
                deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
                id: member.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
            },
        ];

        if (supportRole) {
            permissionOverwrites.push({
                id: supportRole.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
            });
        }

        // Create the ticket channel named ticket-username
        try {
            const ticketChannel = await guild.channels.create({
                name: `ticket-${member.user.username.toLowerCase()}`,
                type: ChannelType.GuildText,
                topic: `Support ticket for ${member.user.tag} | TicketOwnerID:${member.id}`,
                permissionOverwrites,
                reason: `Ticket created by ${member.user.tag}`,
            });

            await interaction.reply({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });

            ticketChannel.send(`Hello <@${member.id}>. Thank you for opening a ticket. Type /discount followed by your discount code to apply a coupon.`);

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to create the ticket channel. Please contact support.', ephemeral: true });
        }

        return;
    }

    // /discount command
    if (commandName === 'discount') {
        // Must be in a ticket channel and user must be ticket owner or support
        if (!isTicketChannel(channel, member.id)) {
            // Check if member has support role and channel is ticket
            if (supportRole && member.roles.cache.has(supportRole.id)) {
                // Allowed for support anyway
            } else {
                await interaction.reply({ content: 'You can only use this command inside your own ticket channel.', ephemeral: true });
                return;
            }
        }

        const code = interaction.options.getString('code').toUpperCase();

        if (validDiscountCodes.has(code)) {
            await interaction.reply({ content: `Discount code \`${code}\` is valid! Applying discount...`, ephemeral: false });
            // Additional code could be placed here to apply discounts or record usage
        } else {
            await interaction.reply({ content: `Discount code \`${code}\` is invalid or expired. Please try again.`, ephemeral: true });
        }

        return;
    }

    // /close command
    if (commandName === 'close') {
        if (!isTicketChannel(channel, member.id)) {
            // Allow support role to close tickets too
            if (supportRole && member.roles.cache.has(supportRole.id)) {
                // Allowed to close
            } else {
                await interaction.reply({ content: 'You can only close your own ticket channel.', ephemeral: true });
                return;
            }
        }

        try {
            await interaction.reply({ content: 'Closing this ticket channel in 5 seconds...' });

            setTimeout(async () => {
                await channel.delete('Ticket closed');
            }, 5000);

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Failed to close the ticket channel.', ephemeral: true });
        }

        return;
    }
});

client.login(token);

