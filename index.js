const Twitter = require('twitter');
const Telegraf = require('telegraf');
const { delayUnlessShutdown } = require('shutin');
const { promisifyAll } = require('bluebird');
const isProduction = process.env.NODE_ENV === 'production';

const config = require('yargs')
  .env('TTT')
  .options({
    interval: { default: 30, number: true },
    telegramChatId: { demandOption: true },
    telegramBotToken: { demandOption: true },
    twitterScreenName: { demandOption: true },
    redisUrl: { demandOption: isProduction },
  }).argv;

const redis = require('redis');
promisifyAll(redis);
const redisClient = redis.createClient(config.redisUrl);

const twitter = new Twitter({
  consumer_key: config.twitterConsumerKey,
  consumer_secret: config.twitterConsumerSecret,
  access_token_key: config.twitterAccessToken,
  access_token_secret: config.twitterAccessTokenSecret,
});

const bot = new Telegraf(config.telegramBotToken);

bot.telegram.getMe().then(botInfo => {
  bot.options.username = botInfo.username;
});

const redisKeyPrefix = [
  config.twitterScreenName,
  config.telegramBotToken.split(/:/)[0],
  config.telegramChatId,
].join('_');

async function main() {
  bot.startPolling();

  do {
    const sinceId = await redisClient.getAsync(`${redisKeyPrefix}:sinceId`);

    const tweets = await twitter.get('statuses/user_timeline', {
      screen_name: config.twitterScreenName,
      ...(sinceId ? { since_id: sinceId } : {}),
      count: 10,
    });

    if (sinceId) {
      for (const tweet of tweets) {
        // Stop relaying once the most recently relayed tweet is reached
        if (tweet.id_str === sinceId) {
          break;
        }

        await bot.telegram.sendMessage(
          config.telegramChatId,
          [
            `@${tweet.user.screen_name}: ${tweet.text}`,
            `https://twitter.com/${tweet.user.screen_name}/status/${
              tweet.id_str
            }`,
          ].join('\n'),
          { parse_mode: 'Markdown' }
        );
      }
    }

    const [mostRecentTweet] = tweets;

    if (mostRecentTweet) {
      await redisClient.setAsync(
        `${redisKeyPrefix}:sinceId`,
        mostRecentTweet.id_str
      );
    }
  } while (!(await delayUnlessShutdown(config.interval * 1000)));
}

main().then(process.exit);
