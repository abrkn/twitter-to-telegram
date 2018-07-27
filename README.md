# twitter-to-telegram

Relay tweets to Telegram

## Install

`npm install`

## Dependencies

- Redis (specified as `REDIS_URL` environment variable or `--redisUrl` argument)

## Run

`npm start -- --telegramChatId=1234 --telegramBotToken=ABC --twitterScreenName=abrkn --twitterConsumerKey=ABC --twitterConsumerSecret=ABC`

## Configuration

Run without arguments to see configuration options. Options can also
be specified as environment variables prefixed with `TTT_`, such that
`TTT_TELEGRAM_CHAT_ID=-1234 npm start` is equivalent to `npm start -- --telegramChatId=1234`

## License

MIT
