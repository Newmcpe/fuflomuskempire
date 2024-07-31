import { MuskEmpireAccount } from '../util/config-schema.js';
import { getHeroInfo, tap } from '../api/muskempire/musk-empire-api.js';
import { isCooldownOver, setCooldown } from './heartbeat.js';
import { Color, Logger } from '@starkow/logger';
import { formatNumber } from '../util/math.js';
import random from 'random';

const log = Logger.create('[Tapper]');

export const tapper = async (account: MuskEmpireAccount, apiKey: string) => {
    if (!isCooldownOver('noTapsUntil', account)) return;

    const {
        data: { data: heroInfo },
    } = await getHeroInfo(apiKey);

    let energy = heroInfo.earns.task.energy;

    const tapsPerSeconds = random.int(20, 30);
    const seconds = random.int(4, 6);

    const earnedMoney =
        heroInfo.earns.task.moneyPerTap * tapsPerSeconds * seconds;

    energy -= earnedMoney;

    if (energy > 0) {
        const {
            data: { success },
            status,
        } = await tap(apiKey, earnedMoney, energy, seconds);

        if (success && status === 200) {
            log.info(
                Logger.color(account.clientName, Color.Cyan),
                Logger.color(' | ', Color.Gray),
                `Натапал на`,
                Logger.color(`+${formatNumber(earnedMoney)} 🪙`, Color.Green),
                Logger.color(' | ', Color.Gray),
                `Осталось энергии:`,
                Logger.color(String(energy), Color.Yellow)
            );

            setCooldown('noTapsUntil', account, random.int(5, 60));
        } else {
            log.info(
                Logger.color(account.clientName, Color.Cyan),
                Logger.color(' | ', Color.Gray),
                `Ушли в рейт лимит, слипаем 30 сек`
            );

            setCooldown('noTapsUntil', account, 30);
        }
    } else {
        log.info(
            Logger.color(account.clientName, Color.Cyan),
            Logger.color(' | ', Color.Gray),
            `Нет энергии для тапа`
        );
        setCooldown('noTapsUntil', account, 200);
    }
};
