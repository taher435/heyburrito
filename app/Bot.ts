import { default as log } from 'bog';
import { parseMessage } from './lib/parseMessage';
import { validBotMention, validMessage } from './lib/validator';
import storeminator from './lib/storeminator';
import BurritoStore from './store/BurritoStore';

// interfaces
import EmojiInterface from './types/Emoji.interface';
import SlackMessageInterface from './types/SlackMessage.interface';
import UserInterface from './types/User.interface';
import { RTMClient } from '@slack/client';
import config from './lib/config'

const dailyCap: number = parseInt(config("SLACK_DAILY_CAP"));

const emojis: Array<EmojiInterface> = [];

if (process.env.SLACK_EMOJI_INC) {
    const incEmojis = process.env.SLACK_EMOJI_INC.split(', ');
    incEmojis.forEach(emoji => emojis.push({ type: 'inc', emoji }));
}

if (process.env.SLACK_EMOJI_DEC) {
    const incEmojis = process.env.SLACK_EMOJI_DEC.split(',');
    incEmojis.forEach(emoji => emojis.push({ type: 'dec', emoji }));
}
class Bot {

    rtm;
    wbc;
    botUserID: Function;
    serverStoredSlackUsers: Function;
    allBots: Function;

    constructor(rtm, wbc, botUserID: Function, serverStoredSlackUsers: Function, allBots: Function) {
        this.rtm = rtm;
        this.wbc = wbc;
        this.botUserID = botUserID;
        this.serverStoredSlackUsers = serverStoredSlackUsers;
        this.allBots = allBots;
    }

    async sendToUser(username: string, text: string) {
        log.info('Will send to user', username);
        log.info('With data', text);

        const res = await this.wbc.chat.postMessage({
            channel: username,
            text: text,
            username: "heyburrito",
            icon_emoji: ":burrito:"
        })
        if (res.ok) {
            log.info(`Notified user ${username}`)
        }
    }

    listener(): void {
        log.info('Listening on slack messages');
        this.rtm.on('message', (event: SlackMessageInterface) => {
            this.handleEvent(event)
        })
    }

    handleEvent(event) {

        if ((!!event.subtype) && (event.subtype === 'channel_join')) {
            log.info('Joined channel', event.channel);
        }

        if (event.type === 'message') {
            if (validMessage(event, emojis, this.allBots)) {
                if (validBotMention(event, this.botUserID)) {
                    // Geather data and send back to user

                } else {
                    const result = parseMessage(event, emojis);
                    if (result) {
                        const { giver, updates } = result;
                        if (updates.length) {
                            this.handleBurritos(giver, updates);
                        }
                    }
                }
            }
        }
    }

    async handleBurritos(giver: string, updates) {

        // Get given burritos today
        const burritos = await BurritoStore.givenBurritosToday(giver)

        log.info(`${giver} has given ${burritos.length} burritos today`);

        const diff = dailyCap - burritos.length

        if (updates.length > diff) {

            this.sendToUser(giver, `You are trying to give away ${updates.length}, but u have only ${diff} left!`)
            log.info(`User ${giver} is trying to give ${updates.length}, but u have only ${diff} left`)
            return;
        }

        if (burritos.length >= dailyCap) {
            log.info(`Daily cap of ${dailyCap} reached`);
            return;
        }

        const a = updates.shift();

        if (a.type === 'inc') {

            await BurritoStore.giveBurrito(a.username, giver)
            if (updates.length) {
                this.handleBurritos(giver, updates);
            }

        } else if (a.type === 'dec') {
            await BurritoStore.takeAwayBurrito(a.username, giver)
            if (updates.length) {
                this.handleBurritos(giver, updates);
            }
        }
    }
}

export default Bot;
