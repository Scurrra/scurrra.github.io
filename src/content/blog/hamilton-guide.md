---
title: 'Hamilton.cr, Telegram Bot API wrapper for Crystal'
description: 'Example of a simple Telegram Bot with Hamilton.cr.'
pubDate: 'Nov 02 2025'
updateDate: 'Nov 07 2025'
---

> [Medium.com edition](https://medium.com/@iljabarouski/hamilton-cr-telegram-bot-api-wrapper-for-crystal-5a9de45f0e28)

>  often struggle to name my projects. This time I was looking for something that combined airplanes (a paper airplane from the Telegram logo) and crystals. And the name Hamilton came to mind &mdash; the name of the airport near the Great Barrier Reef [^1].
[^1]: Yes, I know that corals are not crystals, but corals *contain* crystals. 

Crystal lang has a powerful macro programming system, so I decided to do some funny and useful things with it. [Last time](https://scurrra.github.io/blog/fossil-guide/) I made [Fossil.cr](https://github.com/Scurrra/fossil) &mdash; a simple Web API framework. After that I decided that it would be entertaining[^2] to build a Telegram Bot API wrapper for Crystal, because [there were not any](https://core.telegram.org/bots/samples). 
[^2]: *It was not entertaining most of the time.* I didn't want to scrap [the Bot API reference](https://core.telegram.org/bots/api), so I spent some time creating all the types and a huge constant dictionary of methods, from which methods were actually generated.

n this article, I’ll introduce a *simple* shard for creating Telegram bots. The interface is even simpler than in Fossil, the functionality is easily extendable with custom handlers, though the provided handler is great itself (I really like it).

# Creating a Telegram Bot

To create and manage bots [`@BotFather`](https://t.me/BotFather) bot is used. The command you need is `/newbot`. Just send this command to the bot, and the creation process will begin. You will need to choose a display name for your bot and a username like `@<bot_name>_bot`. At the end `@BotFather` will return you a message containing a token needed to access HTTP API.

# [`Hamilton::Api`](https://scurrra.github.io/hamilton/Hamilton/Api.html)

`Hamilton::Api` class provides all the API functions with validation of its arguments and return types. Basically you need one instance of this class, and it is better to be a constant: this will allow you to use it in both top-level scope and your functions/methods (which is not possible with simple top-level variables).

```crystal
API = Hamilton::Api.new(token: "<YOUR-BOT-TOKEN>")
```

`token` is the only required parameter for API initialization, but you can also `log_level`. 
 - The default `log_level` is `Log::Severity::Warn`, that means that you will see only warnings if an API call returned an error. 
 - With `log_level: Log::Severity::Info` on each call method name and passed arguments will be printed as logs; 
 - with `log_level: Log::Severity::Debug` request and response bodies will be printed besides the method info.

> With `Hamilton::Api` and `Hamilton::Types::` you can create your own bots by hand, because these are the API wrapper. The rest of the article describes the shard's functionality to develop simple bots the easy way.

# [`Hamilton::Bot`](https://scurrra.github.io/hamilton/Hamilton/Bot.html)

`Hamilton::Bot` class provides a simple functionality for handling updates &mdash; special structures that store information about a single interaction with the bot or an event the bot is notified about &mdash; with long pooling. All your interaction with the instance of this class is very simple:
1. Create the bot with an API instance and a handler (more about handlers later):
```crystal
bot = Hamilton::Bot.new(
  api: API,
  handler: Hamilton::LogHandler.new
)
```
Optionally you can pass `offset` and `timeout` parameters to control long pooling (more information [here](https://core.telegram.org/bots/api#getting-updates)). `offset` is basically an id of the first update to process; after stopping the bot you will see the id of the first update to handle on the next run.

2. Optionally add a graceful shutdown for the listening bot.
```crystal
# invokes on `Ctrl+C`
Signal::INT.trap do
  bot.stop
end
```

3. Start listening
```crystal
bot.listen
```

> `Hamilton::Bot.new` also needs a `handler` parameter (basically there are many [constructors](https://scurrra.github.io/hamilton/Hamilton/Bot.html#constructors), but logic is the same). `Hamilton::Handler` is a module similar to [`HTTP::Handler`](https://crystal-lang.org/api/1.18.2/HTTP/Handler.html) and provides logic for chaining handlers &mdash; special classes that process updates. Hamilton.cr provides two basic handlers: `Hamilton::LogHandler` and `Hamilton::CmdHandler`.

# [`Hamilton::LogHandler`](https://scurrra.github.io/hamilton/Hamilton/LogHandler.html)

`Hamilton::LogHandler` wraps Crystal's [`Log`](https://crystal-lang.org/api/1.18.2/Log.html) class (so it has the same constructor parameters). This handler logs the start time of update processing (since calling the `Hamilton::LogHandler` handler), prints type of update, and time used to execute next handlers in the chain. So, it's more useful to be the first in the chain.

# [`Hamilton::CmdHandler`](https://scurrra.github.io/hamilton/Hamilton/CmdHandler.html)

> The basic interaction with every bot is through commands, so yeah, it is "command handler". But commands are just one of possible types of updates.

Under the hood, `Hamilton::CmdHandler` creates a mapper between the function name that was previous in the interaction flow[^3] (`:root` if it's a starting update), update type, and a function that will be called to process the incoming update. The handler instance also stores context, that contains the last method called for the user/chat, and some data you need.
[^3]: The word "flow" is used as a term for logical interaction line between a bot and a user.

> [`Hamilton::Context`](https://scurrra.github.io/hamilton/Hamilton/Context.html) may also be useful for your own handlers.

How to create a new `Hamilton::CmdHandler` instance and make it work? First, create a non-constant variable:
```crystal
# `log_level` is set to `Log::Severity::Info` which covers all the needed log cases;
# setting it to `Log::Severity::Debug` will print some inner information.
handler = Hamilton::CmdHandler.new
```

Second, create methods with special annotations:
 - `@[Handler(handler)]` specifies that the method is a part of `handler`'s logic;
 - `@[Handle(...)]` specifies the type of update the method processes;
 - (optional) `@[For(...)]` specifies a (list of) symbolic name of method for those the handling update was a response to. As the same type of updates may have the same processing logic when being a response to different methods, many methods may be passed as arguments to this annotation. If annotation was not specified, the method is treated like it processes the first incoming message in a flow from the user. So, when the method should process an update from both the middle and the start of the flow, `:root` should be passed together with the other methods' names.

All methods should have three parameters: one depends on the type of the update it processes, the second one should be `update`, and the third &mdash; `context`. As `update` to the method an actual instance of `Hamilton::Types::Update` will be passed for some complex logic. `context`, on the other hand, is not of type `Hamilton::Context`, but `Hash(Symbol, JSON::Any) | Nil`. `context` provides data you have stored for the user/chat the update comes from and preserves after the flow ends. To update the stored data you should return the new `context` variable from the method, or `nil` to keep the old data (to reset return the empty Hash).

`@[Handle(...)]` can get the following arguments:
 - `command` &mdash; a bot command like "/<command-name>" or just "<command-name>". In this case the method should have `argument` argument, which will get the rest of the text from the message, even if there is nothing, as a String.
 - `text` &mdash; a known text you expect from the user; useful for handling messages sent using [reply keyboards](https://core.telegram.org/bots/features#keyboards). In this case the method should have `remaining_text` argument, which will get the text that comes after the known as a String. If `text: ""`, the method will handle all the messages and get the whole message text as `remaining_text`; should be specified after all the methods that handle meaningful texts.
 - `callback` &mdash; a String payload from [inline keyboards](https://core.telegram.org/bots/features#inline-keyboards). In this case the method should have only `update` and `context` arguments. These updates are not great, because only they use something called `chat_instance`. Under the hood, almost always chat id is used as a key for context data, so in some rare cases wrong context may be found, which may cause logical errors. If both `chat_instance` and chat id didn't match any methods, user id is used as a key, that is ok only if the message with the reply keyboard causes the start of user-bot interaction (like when a user presses a button in a channel and a bot starts a chat with them). So please, avoid using it.
 - An unnamed argument that is one of available [`PAYLOAD_TYPES`](https://scurrra.github.io/hamilton/toplevel.html#constant-summary). In this case the method should have an argument of the same type; it is recommended to specify a type for the argument to convert to (usually that from `Hamilton::Types::Update` field with the same name but without `Nil`), because if not you will have to convert it by hand.

# Example

Here is an example of a bot that demonstrates almost all the library's functionality.

```crystal
require "hamilton"

API = Hamilton::Api.new(token: "<YOUR-BOT-TOKEN>")

handler = Hamilton::CmdHandler.new

@[Handler(handler)]
@[Handle(command: "/start")]
def handle_start_command(argument, context, update)
  message = update.message.as(Hamilton::Types::Message)

  API.sendMessage(
    chat_id: message.chat.id,
    text: "Bot recieved `/start` command"
  )

  return nil
end

@[Handler(handler)]
@[Handle(command: "help")]
def handle_help_command(argument, context, update)
  message = update.message.as(Hamilton::Types::Message)

  API.sendMessage(
    chat_id: message.chat.id,
    text: "Bot recieved `/help` command"
  )

  return nil
end

@[Handler(handler)]
@[Handle(text: "hi")]
def handle_hi_text(remaining_text, context, update)
  message = update.message.as(Hamilton::Types::Message)

  API.sendMessage(
    chat_id: message.chat.id,
    text: "Bot recieved 'hi' know text message"
  )

  return nil
end

@[Handler(handler)]
@[Handle(text: "")]
def handle_any_text(remaining_text, context, update)
  message = update.message.as(Hamilton::Types::Message)

  API.sendMessage(
    chat_id: message.chat.id,
    text: "Bot recieved '`#{remaining_text}`' text message"
  )

  return nil
end

@[Handler(handler)]
@[Handle(:sticker)]
@[For(:root, :handle_hi_text)]
def handle_sticker(sticker, context, update) # Hamilton::Types::Sticker
  sticker = sticker.as(Hamilton::Types::Sticker)
  message = update.message.as(Hamilton::Types::Message)

  API.sendMessage(
    chat_id: message.chat.id,
    text: "Bot recieved ':sticker' message [#{sticker.file_id}]"
  )

  API.sendSticker(
    chat_id: message.chat.id,
    sticker: sticker.file_id
  )

  return nil
end

@[Handler(handler)]
@[Handle(:animation)]
@[For(:root, :handle_hi_text)]
def handle_animation(animation : Hamilton::Types::Animation, context, update)
  message = update.message.as(Hamilton::Types::Message)

  API.sendMessage(
    chat_id: message.chat.id,
    text: "Bot recieved ':sticker' message [#{animation.file_id}]"
  )

  API.sendAnimation(
    chat_id: message.chat.id,
    animation: animation.file_id
  )

  return nil
end

bot = Hamilton::Bot.new(
  api: API,
  handlers: [
    Hamilton::LogHandler.new, 
    handler
  ]
)

Signal::INT.trap do
  bot.stop
end

bot.listen
```

This bot will receive `/start` and `/help` commands, "hi" known text and show it, any text and send it back, `:sticker` and `:animation` will be sent back too with extra information. Note, that `:sticker` and `:animation` may be a response to `:handle_hi_text` that means that the bot will be blocked until it receives a sticker or an animation from the user.

Now, you may tell the `@BotFather` about what commands your bot can handle, and they will appear in special menu in a chat with the bot. To do so:
1. send command `/mybots`;
2. choose your bot from a list;
3. click "Edit Bot" button;
4. click "Edit Commands";
5. specify commands and descriptions as `@BotFather` tells you. Keep in mind, that you should specify all the commands you want in once, even if you are just adding a new command to old ones.

# Async Hamilton

By default, Hamilton handles updates one by one. It means that
1. if you have many users, each should wait for their queue;
2. the user can not stop bot from handling their update midway.

Both these issues have sense only if some updates take a lot of time to be handled. Since `v0.2.0` the bot can be compiled with flag `-Dasync` (crystal's way to pass compilation flags) to make `Bot` use crystal's powerful `Fiber`s. Basically, with this flag handling of each update is done on a separate fiber. Now, the bot can handle updates from different users at the same time.

The challenge with `CmdHandler` is that it allows storing data in the context, which is overwritten after each update is processed. So, when the user sends an update while the old one hasn't been handled yet, the new gets the old update? And what if the user wants to stop handling of the old update? The answer is that async `CmdHandler` has a different behavior: 
 - it implicitly creates a `/signal` command, so the developer can not;
 - it requires the developer to add `signal : Channel(Signal)` argument to each method (type is optional, it is easily inferred by the compiler), and then the update is passed to the next handler in the chain;
 - when handler gets an update, it creates a channel to communicate with the method, and passes it as the `signal` argument;
 - if the channel is already here, it means that an old update from the same chat (in most cases) is handled now. In this case, [`Signal::TSTP`](https://en.wikipedia.org/wiki/Signal_(IPC)#SIGTSTP) is passed to the method through the channel ([`Signal`](https://crystal-lang.org/api/1.18.2/Signal.html) is a built-in type to safely handle inter-process signals on POSIX systems, and for consistence it is chosen for communication between a user and the bot, even implicitly);
 - if the user sends `/signal` command, its argument is parsed as `Signal` type and passed to the method as is.

Yes, I understand, that it's too complicated for a regular bot user, but:
1. the developer is not forced to inform the user about their ability to send `/signal` commands to the bot;
2. the developer is not forced to handle signals, only to have the `signal` argument in all the methods with `@[Handler]` annotation;
3. regular bot users usually don't need an ability to somehow control the handling process;
4. the `/signal` command is added for consistency: anyway there is a channel passed to the method, let's use it!
5. I have not come up with any other solution. 

And here is a very small example:
```crystal
require "hamilton"

API = Hamilton::Api.new(token: "<YOUR-BOT-TOKEN>")

handler = Hamilton::CmdHandler.new

# here go some methods

@[Handler(handler)]
@[Handle(:sticker)]
@[For(:root, :handle_hi_text)]
def handle_sticker(sticker, context, update, signal = nil) # Hamilton::Types::Sticker
  sticker = sticker.as(Hamilton::Types::Sticker)
  message = update.message.as(Hamilton::Types::Message)

  API.sendMessage(
    chat_id: message.chat.id,
    text: "Bot recieved ':sticker' message [#{sticker.file_id}]"
  )

  # just sleep, ignore all the signals sent
  sleep 20.seconds

  API.sendSticker(
    chat_id: message.chat.id,
    sticker: sticker.file_id
  )

  return nil
end

@[Handler(handler)]
@[Handle(:animation)]
@[For(:root, :handle_hi_text)]
def handle_animation(animation : Hamilton::Types::Animation, context, update, signal)
  message = update.message.as(Hamilton::Types::Message)

  API.sendMessage(
    chat_id: message.chat.id,
    text: "Bot recieved ':sticker' message [#{animation.file_id}]"
  )

  10.times do
    select
    # if we have a signal
    when s = signal.receive?
      # if it is an interaption signal
      if s == Signal::INT
        # tell it back to the user
        API.sendMessage(
          chat_id: message.chat.id, 
          text: "`Signal::INT` was received"
        )
        # and quit
        return nil
      end

    # otherwise, sleep for a second
    when timeout 1.second
      # and tell the user, that we are sleeping
      API.sendMessage(
        chat_id: message.chat.id,
        text: "Sleeping"
      )
    end
  end

  API.sendAnimation(
    chat_id: message.chat.id,
    animation: animation.file_id
  )

  return nil
end

# and here go some more methods

bot = Hamilton::Bot.new(
  api: API,
  handlers: [
    Hamilton::LogHandler.new, 
    handler
  ]
)

Signal::INT.trap do
  bot.stop
end

bot.listen
```

Anyway, I would consider using `-Dasync` and not telling anyone about `/signal` if it's a simple bot.

# Conclusion

> I hope you will find this guide and the package itself useful.

- [Hamilton.cr docs](https://scurrra.github.io/hamilton/)
- [Hamilton.cr github](https://github.com/Scurrra/hamilton/)
