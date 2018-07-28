const Twitter = require('twitter');
const Telegraf = require('telegraf');
const { delayUnlessShutdown } = require('shutin');
const { promisifyAll } = require('bluebird');
const isProduction = process.env.NODE_ENV === 'production';

// "because the count parameter retrieves that many Tweets before filtering out retweets and replies."
const MAX_TWEET_COUNT = 1000;

const config = require('yargs')
  .env('TTT')
  .options({
    interval: { default: 30, number: true },
    telegramChatId: { demandOption: true },
    telegramBotToken: { demandOption: true },
    twitterScreenName: { demandOption: true },
    redisUrl: { demandOption: isProduction, default: process.env.REDIS_URL },
    twitterConsumerKey: { demandOption: true },
    twitterConsumerSecret: { demandOption: true },
  }).argv;

const redis = require('redis');
promisifyAll(redis);
const redisClient = redis.createClient(config.redisUrl);

const twitter = new Twitter({
  consumer_key: config.twitterConsumerKey,
  consumer_secret: config.twitterConsumerSecret,
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

const storeSinceId = _ => redisClient.setAsync(`${redisKeyPrefix}:sinceId`, _);

async function main() {
  bot.startPolling();

  do {
    const sinceId = await redisClient.getAsync(`${redisKeyPrefix}:sinceId`);

    const tweets = await twitter.get('statuses/user_timeline', {
      screen_name: config.twitterScreenName,
      exclude_replies: true,
      include_rts: false,
      ...(sinceId ? { since_id: sinceId } : {}),
      count: MAX_TWEET_COUNT,
    });

    if (sinceId) {
      for (const tweet of tweets.slice().reverse()) {
        // Stop relaying once the most recently relayed tweet is reached
        if (tweet.id <= +sinceId) {
          continue;
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

        await storeSinceId(tweet.id_str);
      }
    } else {
      const [mostRecentTweet] = tweets;

      if (mostRecentTweet) {
        await storeSinceId(mostRecentTweet.id_str);
      }
    }
  } while (!(await delayUnlessShutdown(config.interval * 1000)));
}

main().then(process.exit);
