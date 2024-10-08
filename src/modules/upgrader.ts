import { MuskEmpireAccount } from '../util/config.js';
import { getUpgrades, Upgrade } from '../api/muskempire/musk-empire-service.js';
import {
    getHeroInfo,
    improveSkill,
} from '../api/muskempire/musk-empire-api.js';
import { Color, Logger } from '@starkow/logger';
import { isCooldownOver, setCooldown } from '../heartbeat.js';
import { formatNumber } from '../util/math.js';

const log = Logger.create('[Upgrader]');
const ignoredUpgrades: Record<string, number> = {};
const upgradeNotFinishedWaitMinutes = 10;

export const upgrader = async (account: MuskEmpireAccount, apiKey: string) => {
    if (!isCooldownOver('noUpgradesUntil', account)) return;

    const upgrades = await getUpgrades(apiKey);
    const {
        data: { data: heroInfo },
    } = await getHeroInfo(apiKey);

    const bestUpgrade = upgrades
        .filter(
            (upgrade) =>
                upgrade.isCanUpgraded &&
                !upgrade.isMaxLevel &&
                (!ignoredUpgrades[upgrade.id] ||
                    ignoredUpgrades[upgrade.id] < Date.now())
        )
        .reduce<Upgrade | null>((best, upgrade) => {
            const upgradeRatio =
                upgrade.profitIncrement / upgrade.priceNextLevel;
            const bestRatio = best
                ? best.profitIncrement / best.priceNextLevel
                : -Infinity;

            return upgradeRatio > bestRatio ? upgrade : best;
        }, null);

    if (!bestUpgrade) {
        log.info(
            Logger.color(account.clientName, Color.Cyan),
            `Нет доступных улучшений`
        );
        setCooldown('noUpgradesUntil', account, 600);
        return;
    }

    if (bestUpgrade.priceNextLevel > heroInfo.money) {
        const hoursToGetMoney = Math.ceil(
            (bestUpgrade.priceNextLevel - heroInfo.money) /
                heroInfo.moneyPerHour
        );

        if (hoursToGetMoney > 18) {
            ignoredUpgrades[bestUpgrade.id] = Date.now() + 60 * 60 * 1000;
            log.warn(
                Logger.color(account.clientName, Color.Cyan),
                `Время накопления денег на улучшение`,
                Logger.color(bestUpgrade.id, Color.Yellow),
                `слишком большое. Пропущен на`,
                Logger.color('1', Color.Magenta),
                `час.`
            );
            return;
        }

        log.info(
            Logger.color(account.clientName, Color.Cyan),
            Logger.color(' | ', Color.Gray),
            `Недостаточно денег для улучшения`,
            Logger.color(bestUpgrade.id, Color.Yellow),
            'Не хватает:',
            Logger.color(
                formatNumber(bestUpgrade.priceNextLevel - heroInfo.money),
                Color.Magenta
            ),
            '🪙',
            `|`,
            'Расчетное время до наличия денег:',
            Logger.color(
                formatNumber(
                    (bestUpgrade.priceNextLevel +
                        account.preferences.minimalBalance -
                        heroInfo.money) /
                        heroInfo.moneyPerHour
                ),
                Color.Magenta
            ),
            `часов`
        );
        setCooldown('noUpgradesUntil', account, 600);
        return;
    }

    if (
        heroInfo.money - bestUpgrade.priceNextLevel <
        account.preferences.minimalBalance
    ) {
        log.info(
            Logger.color(account.clientName, Color.Cyan),
            Logger.color(' | ', Color.Gray),
            `Недостаточно денег на минимальный баланс после улучшения`,
            Logger.color(bestUpgrade.id, Color.Yellow),
            'Не хватает:',
            Logger.color(
                formatNumber(
                    bestUpgrade.priceNextLevel -
                        heroInfo.money +
                        account.preferences.minimalBalance
                ),
                Color.Magenta
            )
        );
        setCooldown('noUpgradesUntil', account, 600);
        return;
    }

    heroInfo.money -= bestUpgrade.priceNextLevel;

    const response = await improveSkill(apiKey, bestUpgrade.id);

    if (
        response.data.success === false &&
        response.data.error === 'skill requirements fail: upgrade not finished'
    ) {
        log.warn(
            Logger.color(account.clientName, Color.Cyan),
            Logger.color(' | ', Color.Gray),
            `Продукт`,
            Logger.color(bestUpgrade.id, Color.Yellow),
            `не улучшен. Пропущен на`,
            Logger.color(
                upgradeNotFinishedWaitMinutes.toString(),
                Color.Magenta
            ),
            `минут.`
        );
        ignoredUpgrades[bestUpgrade.id] =
            Date.now() + upgradeNotFinishedWaitMinutes * 60 * 1000;
    } else {
        log.info(
            Logger.color(account.clientName, Color.Cyan),
            Logger.color(' | ', Color.Gray),
            `Успешно улучшено`,
            Logger.color(bestUpgrade!.id, Color.Yellow),
            `с ценой`,
            Logger.color(
                formatNumber(bestUpgrade!.priceNextLevel),
                Color.Magenta
            ),
            `до`,
            Logger.color(
                (bestUpgrade!.currentLevel + 1).toString(),
                Color.Magenta
            ),
            `уровня |\n`,
            `Заработок каждый час:`,
            Logger.color(
                formatNumber(
                    bestUpgrade!.profitIncrement + heroInfo.moneyPerHour
                ),
                Color.Magenta
            ),
            Logger.color(`(+${bestUpgrade!.profitIncrement})`, Color.Green),
            'Окупаемость:',
            Logger.color(
                formatNumber(
                    bestUpgrade!.priceNextLevel / bestUpgrade!.profitIncrement
                ),
                Color.Magenta
            ),
            Logger.color(`часов`, Color.Green),
            `\n`,
            Logger.color(`Осталось денег:`, Color.Green),
            Logger.color(formatNumber(heroInfo.money), Color.Magenta)
        );
    }

    setCooldown('noUpgradesUntil', account, 30);
};
